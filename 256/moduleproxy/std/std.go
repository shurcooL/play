// Package std provides a Go module proxy server augmentation
// that adds the module std, containing the Go standard library.
package std

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/shurcooL/httperror"
	"github.com/shurcooL/play/256/moduleproxy"
	"golang.org/x/build/maintner/maintnerd/maintapi/version"
	"golang.org/x/mod/semver"
	"gopkg.in/src-d/go-git.v4"
	"gopkg.in/src-d/go-git.v4/config"
	"gopkg.in/src-d/go-git.v4/plumbing"
	"gopkg.in/src-d/go-git.v4/plumbing/filemode"
	"gopkg.in/src-d/go-git.v4/plumbing/object"
	"gopkg.in/src-d/go-git.v4/storage/memory"
)

type Server struct {
	// Go standard library versions.
	versionsMu sync.Mutex
	versions   map[string]goVersion // Semantic version → Go version.

	// sortedList is a cached /std/@v/list endpoint response.
	sortedList []byte

	fallback moduleproxy.Server
}

type goVersion struct {
	Version string // Go version, like "go1.12".
	module
}

type module struct {
	Time time.Time // Version time.
	Zip  []byte    // Module zip.
}

func NewServer(fallback moduleproxy.Server) (Server, error) {
	// Fetch a list of all Go release versions.
	remote := git.NewRemote(memory.NewStorage(), &config.RemoteConfig{
		URLs: []string{"https://go.googlesource.com/go"},
	})
	refs, err := remote.List(&git.ListOptions{})
	if err != nil {
		return Server{}, err
	}
	var versions = make(map[string]goVersion) // Semantic version → Go version.
	for _, r := range refs {
		name := string(r.Name())
		if !strings.HasPrefix(name, "refs/tags/") {
			continue
		}
		tagName := name[len("refs/tags/"):]
		major, minor, patch, ok := version.ParseTag(tagName)
		if !ok {
			continue
		}
		versions[fmt.Sprintf("v%d.%d.%d", major, minor, patch)] = goVersion{Version: tagName}
	}
	// TODO: Support all pre-release versions.
	versions["v1.13.0-beta.1"] = goVersion{Version: "go1.13beta1"}
	versions["v1.13.0-rc.1"] = goVersion{Version: "go1.13rc1"}
	versions["v1.13.0-rc.2"] = goVersion{Version: "go1.13rc2"}

	// Create a sorted list of versions.
	var list []string
	for v := range versions {
		list = append(list, v)
	}
	sort.Slice(list, func(i, j int) bool {
		cmp := semver.Compare(list[i], list[j])
		if cmp == 0 {
			return list[i] < list[j]
		}
		return cmp < 0
	})
	var buf bytes.Buffer
	for _, v := range list {
		fmt.Fprintln(&buf, v)
	}
	sortedList := buf.Bytes()

	return Server{
		versions:   versions,
		sortedList: sortedList,
		fallback:   fallback,
	}, nil
}

func (s Server) ServeHTTP(w http.ResponseWriter, req *http.Request) error {
	if req.Method != http.MethodGet {
		return httperror.Method{Allowed: []string{http.MethodGet}}
	}

	// TODO: Consider parsing proxy request with parseModuleProxyRequest. See https://github.com/shurcooL/home/blob/1718d872828ef4fda604d7586f9347751c5e5d4e/internal/code/module.go#L64-L73.

	if !strings.HasPrefix(req.URL.Path, "/std/@v/") {
		err := s.fallback.ServeHTTP(w, req)
		return err
	}
	rest := req.URL.Path[len("/std/@v/"):]

	if rest == "list" {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, err := w.Write(s.sortedList)
		return err
	}

	ext := path.Ext(rest)
	switch ext {
	case ".info", ".mod", ".zip":
		// Okay.
	default:
		http.Error(w, "404 Not Found", http.StatusNotFound)
		return nil
	}
	semVer := rest[:len(rest)-len(ext)]
	s.versionsMu.Lock()
	goVersion, ok := s.versions[semVer]
	s.versionsMu.Unlock()
	if !ok {
		http.Error(w, "404 Not Found", http.StatusNotFound)
		return nil
	}

	// TODO: Use sync.Once or equivalent to avoid duplicate work.
	if goVersion.Zip == nil {
		module, err := fetchAndCreateStd(semVer, goVersion.Version)
		if err != nil {
			return err
		}
		goVersion.module = module

		s.versionsMu.Lock()
		s.versions[semVer] = goVersion
		s.versionsMu.Unlock()
	}

	switch ext {
	case ".info":
		w.Header().Set("Content-Type", "application/json")
		enc := json.NewEncoder(w)
		enc.SetIndent("", "\t")
		err := enc.Encode(revInfo{
			Version: semVer,
			Time:    goVersion.Time,
		})
		return err
	case ".mod":
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, err := io.WriteString(w, "module std\n")
		return err
	case ".zip":
		w.Header().Set("Content-Type", "application/zip")
		http.ServeContent(w, req, "", goVersion.Time, bytes.NewReader(goVersion.Zip))
		return nil
	default:
		panic("unreachable")
	}
}

// A revInfo describes a single revision in a module repository.
type revInfo struct {
	Version string    // Version string.
	Time    time.Time // Commit time.
}

func fetchAndCreateStd(semVer, goVer string) (module, error) {
	r, err := git.Clone(memory.NewStorage(), nil, &git.CloneOptions{
		URL:           "https://go.googlesource.com/go",
		ReferenceName: plumbing.NewTagReferenceName(goVer),
		SingleBranch:  true,
		Depth:         1,
		Tags:          git.NoTags,
	})
	if err != nil {
		return module{}, err
	}
	head, err := r.Head()
	if err != nil {
		return module{}, err
	}
	commit, err := r.CommitObject(head.Hash())
	if err != nil {
		return module{}, err
	}
	tree, err := r.TreeObject(commit.TreeHash)
	if err != nil {
		return module{}, err
	}
	tree, err = subTree(r, tree, "src")
	if err != nil {
		return module{}, err
	}
	// For versions older than v1.4.0, skip over the extra "pkg" subdirectory.
	if semver.Compare(semVer, "v1.4.0") == -1 {
		tree, err = subTree(r, tree, "pkg")
		if err != nil {
			return module{}, err
		}
	}
	var buf bytes.Buffer
	z := zip.NewWriter(&buf)
	type treePath struct {
		*object.Tree
		Path string
	}
	for frontier := []treePath{{Tree: tree, Path: "std@" + semVer}}; len(frontier) > 0; frontier = frontier[1:] {
		t := frontier[0]
		for _, e := range t.Entries {
			if strings.HasPrefix(e.Name, ".") || strings.HasPrefix(e.Name, "_") {
				continue
			}
			switch e.Mode {
			case filemode.Regular, filemode.Executable:
				blob, err := r.BlobObject(e.Hash)
				if err != nil {
					return module{}, err
				}
				dst, err := z.Create(path.Join(t.Path, e.Name))
				if err != nil {
					return module{}, err
				}
				src, err := blob.Reader()
				if err != nil {
					return module{}, err
				}
				_, err = io.Copy(dst, src)
				if err != nil {
					src.Close()
					return module{}, err
				}
				err = src.Close()
				if err != nil {
					return module{}, err
				}
			case filemode.Dir:
				if e.Name == "testdata" {
					continue
				}
				tree, err := r.TreeObject(e.Hash)
				if err != nil {
					return module{}, err
				}
				frontier = append(frontier, treePath{
					Tree: tree,
					Path: path.Join(t.Path, e.Name),
				})
			}
		}
	}
	err = z.Close()
	if err != nil {
		return module{}, err
	}
	return module{
		Time: commit.Committer.When,
		Zip:  buf.Bytes(),
	}, nil
}

// subTree looks non-recursively for a directory with the given name in t,
// and returns the corresponding tree.
// If a directory with such name doesn't exist in t, it returns os.ErrNotExist.
func subTree(r *git.Repository, t *object.Tree, name string) (*object.Tree, error) {
	for _, e := range t.Entries {
		if e.Name != name {
			continue
		}
		return r.TreeObject(e.Hash)
	}
	return nil, os.ErrNotExist
}
