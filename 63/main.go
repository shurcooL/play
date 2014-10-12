package main

import (
	"bytes"
	"flag"
	"fmt"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"code.google.com/p/go.tools/godoc/vfs"
	"github.com/shurcooL/go-goon"
	"github.com/shurcooL/go/exp/11"
	"github.com/shurcooL/go/markdown_http"
	"github.com/shurcooL/go/raw_file_server"
	vcs2 "github.com/shurcooL/go/vcs"
	"github.com/sourcegraph/apiproxy"
	"github.com/sourcegraph/apiproxy/service/github"
	"github.com/sourcegraph/go-vcs/vcs"
	"github.com/sourcegraph/httpcache"
	"github.com/sourcegraph/vcsstore/vcsclient"

	play48 "github.com/shurcooL/play/48"
)

var httpFlag = flag.String("http", ":8080", "Listen for HTTP connections on this address.")

var sg *vcsclient.Client

func main() {
	flag.Parse()

	transport := &apiproxy.RevalidationTransport{
		Transport: httpcache.NewMemoryCacheTransport(),
		Check: (&githubproxy.MaxAge{
			User:         time.Hour * 24,
			Repository:   time.Hour * 24,
			Repositories: time.Hour * 24,
			Activity:     time.Hour * 12,
		}).Validator(),
	}
	httpClient := &http.Client{Transport: transport}

	sg = vcsclient.New(&url.URL{Scheme: "http", Host: "vcsstore.sourcegraph.com"}, httpClient)

	http.Handle("/inline/", http.StripPrefix("/inline", markdown_http.MarkdownHandlerFunc(inlineHandler)))
	http.Handle("/raw/", http.StripPrefix("/raw", rawHandler())) // DEBUG.
	panic(http.ListenAndServe(*httpFlag, nil))
}

func rawHandler() http.Handler {
	const repoImportPath = "github.com/shurcooL/gostatus"

	cloneUrl, err := url.Parse("https://" + repoImportPath)
	if err != nil {
		panic(err)
	}

	r, err := sg.Repository("git", cloneUrl)
	if err != nil {
		panic(err)
	}

	fs, err := r.FileSystem(vcs.CommitID("2d8bfd02e0632a6fb6617eb5152501759dc20cd5"))
	if err != nil {
		panic(err)
	}

	fs2 := &VcsToVfs{fs}

	return raw_file_server.New(fs2)
}

func inlineHandler(req *http.Request) ([]byte, error) {
	var w = new(bytes.Buffer)

	repo, commitId, subdir, err := repoFromRequest(req)
	if err != nil {
		return nil, err
	}

	bpkg, fset, merged, err := play48.Ysubdir(repo, commitId, subdir)
	if err != nil {
		return nil, err
	}

	fmt.Fprintln(w, "# "+req.URL.Path[1:])
	fmt.Fprintln(w)
	for _, goFile := range bpkg.GoFiles {
		fmt.Fprintln(w, "-\t"+goFile)
	}
	fmt.Fprintln(w)

	fmt.Fprintln(w, "```Go")
	exp11.WriteMergedPackage(w, fset, merged)
	fmt.Fprintln(w, "```")

	return w.Bytes(), nil
}

func importPathToRepoGuess(importPath string) (cloneUrl *url.URL, subdir string, vcsRepo vcs2.Vcs, err error) {
	switch {
	case strings.HasPrefix(importPath, "github.com/"):
		importPathElements := strings.Split(importPath, "/")
		if len(importPathElements) < 3 {
			return nil, "", nil, err
		}

		cloneUrl, err = url.Parse("https://" + path.Join(importPathElements[:3]...))
		if err != nil {
			return nil, "", nil, err
		}

		return cloneUrl, "./" + path.Join(importPathElements[3:]...), vcs2.NewFromType(vcs2.Git), nil
	case strings.HasPrefix(importPath, "code.google.com/p/"):
		importPathElements := strings.Split(importPath, "/")
		if len(importPathElements) < 3 {
			return nil, "", nil, err
		}

		cloneUrl, err = url.Parse("https://" + path.Join(importPathElements[:3]...))
		if err != nil {
			return nil, "", nil, err
		}

		return cloneUrl, "./" + path.Join(importPathElements[3:]...), vcs2.NewFromType(vcs2.Hg), nil
	default:
		return nil, "", nil, err
	}
}

func repoFromRequest(req *http.Request) (vcs.Repository, vcs.CommitID, string, error) {
	importPath := req.URL.Path[1:]
	rev := req.URL.Query().Get("rev")

	cloneUrl, subdir, vcsRepo, err := importPathToRepoGuess(importPath)
	if err != nil {
		return nil, "", "", err
	}

	goon.DumpExpr(cloneUrl, vcsRepo, err)

	repo, err := sg.Repository(vcsRepo.Type().VcsType(), cloneUrl)
	if err != nil {
		return nil, "", "", err
	}

	var commitId vcs.CommitID
	if rev != "" {
		commitId, err = repo.ResolveRevision(rev)
	} else {
		commitId, err = repo.ResolveBranch(vcsRepo.GetDefaultBranch())
	}
	if err != nil {
		err1 := repo.(vcsclient.RepositoryRemoteCloner).CloneRemote()
		fmt.Println("repoFromRequest: CloneRemote:", err1)
		if err1 != nil {
			return nil, "", "", multiError{err, err1}
		}
	} else {
		fmt.Println("repoFromRequest: worked on first try")
	}

	return repo, commitId, subdir, nil
}

// ---

type VcsToVfs struct {
	vcs.FileSystem
}

func (v *VcsToVfs) Open(s string) (vfs.ReadSeekCloser, error) {
	return v.FileSystem.Open(s)
}

// ---

type multiError []error

func (me multiError) Error() string {
	var buf bytes.Buffer
	fmt.Fprintf(&buf, "%d errors:\n", len(me))
	for _, err := range me {
		fmt.Fprintln(&buf, err.Error())
	}
	return buf.String()
}
