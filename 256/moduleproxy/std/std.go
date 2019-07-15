// Package std provides a Go module proxy server augmentation
// that adds the module std, containing the Go standard library.
package std

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"strings"
	"time"

	"github.com/shurcooL/httperror"
	"github.com/shurcooL/play/256/moduleproxy"
	"golang.org/x/build/maintner/maintnerd/maintapi/version"
	"gopkg.in/src-d/go-git.v4"
	"gopkg.in/src-d/go-git.v4/config"
	"gopkg.in/src-d/go-git.v4/plumbing"
	"gopkg.in/src-d/go-git.v4/plumbing/filemode"
	"gopkg.in/src-d/go-git.v4/plumbing/object"
	"gopkg.in/src-d/go-git.v4/storage/memory"
)

type Server struct {
	versions map[string]string // Semantic version → Go version.
	fallback moduleproxy.Server
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
	var versions = make(map[string]string) // Semantic version → Go version.
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
		versions[fmt.Sprintf("v%d.%d.%d", major, minor, patch)] = tagName
	}

	return Server{
		versions: versions,
		fallback: fallback,
	}, nil
}

func (s Server) ServeHTTP(w http.ResponseWriter, req *http.Request) error {
	if req.Method != http.MethodGet {
		return httperror.Method{Allowed: []string{http.MethodGet}}
	}

	if !strings.HasPrefix(req.URL.Path, "/std/@v/") {
		err := s.fallback.ServeHTTP(w, req)
		return err
	}
	rest := req.URL.Path[len("/std/@v/"):]

	if rest == "list" {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		for v := range s.versions {
			fmt.Fprintln(w, v)
		}
		return nil
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
	goVer, ok := s.versions[semVer]
	if !ok {
		http.Error(w, "404 Not Found", http.StatusNotFound)
		return nil
	}

	switch ext {
	case ".info":
		w.Header().Set("Content-Type", "application/json")
		enc := json.NewEncoder(w)
		enc.SetIndent("", "\t")
		err := enc.Encode(revInfo{
			Version: semVer,
			Time:    time.Now().UTC(), // TODO.
		})
		return err
	case ".mod":
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, err := io.WriteString(w, "module std\n")
		return err
	case ".zip":
		w.Header().Set("Content-Type", "application/zip")
		z := zip.NewWriter(w)
		err := walkGoRepository(z, semVer, goVer)
		if err != nil {
			return err
		}
		err = z.Close()
		return err
	default:
		panic("unreachable")
	}
}

// A revInfo describes a single revision in a module repository.
type revInfo struct {
	Version string    // Version string.
	Time    time.Time // Commit time.
}

func walkGoRepository(z *zip.Writer, semVer, goVer string) error {
	r, err := git.Clone(memory.NewStorage(), nil, &git.CloneOptions{
		URL:           "https://go.googlesource.com/go",
		ReferenceName: plumbing.NewTagReferenceName(goVer),
		SingleBranch:  true,
		Depth:         1,
		Tags:          git.NoTags,
	})
	if err != nil {
		return err
	}
	head, err := r.Head()
	if err != nil {
		return err
	}
	commit, err := r.CommitObject(head.Hash())
	if err != nil {
		return err
	}
	tree, err := r.TreeObject(commit.TreeHash)
	if err != nil {
		return err
	}
	tree, err = subTree(r, tree, "src")
	if err != nil {
		return err
	}
	// TODO: For very old versions, also mind the "pkg" subdirectory.
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
					return err
				}
				dst, err := z.Create(path.Join(t.Path, e.Name))
				if err != nil {
					return err
				}
				src, err := blob.Reader()
				if err != nil {
					return err
				}
				_, err = io.Copy(dst, src)
				if err != nil {
					src.Close()
					return err
				}
				err = src.Close()
				if err != nil {
					return err
				}
			case filemode.Dir:
				if e.Name == "testdata" {
					continue
				}
				tree, err := r.TreeObject(e.Hash)
				if err != nil {
					return err
				}
				frontier = append(frontier, treePath{
					Tree: tree,
					Path: path.Join(t.Path, e.Name),
				})
			}
		}
	}
	return nil
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
