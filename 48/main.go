package main

import (
	"fmt"
	"go/build"
	"io"
	"net/http"
	"os"
	"path"
	"strings"

	"github.com/shurcooL/go/gists/gist5504644"
	"github.com/sourcegraph/go-vcs/vcs"
)

func main() {
	http.Handle("/inline/", http.StripPrefix("/inline", http.HandlerFunc(handler)))
	panic(http.ListenAndServe(":8080", nil))
}

func handler(w http.ResponseWriter, req *http.Request) {
	importPath := req.URL.Path[1:]

	bpkg, err := gist5504644.BuildPackageFromImportPath(importPath)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	fmt.Fprintln(w, bpkg.ImportPath)
	fmt.Fprintln(w, bpkg.Dir)
	fmt.Fprintln(w, bpkg.GoFiles)

	gitRepo, err := vcs.OpenGitRepository(bpkg.Dir)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	fs, err := gitRepo.FileSystem(vcs.CommitID(req.URL.Query().Get("rev")))
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	var context build.Context = build.Default
	//context.GOROOT = ""
	context.GOPATH = "/"
	context.JoinPath = path.Join
	context.IsAbsPath = path.IsAbs
	context.SplitPathList = func(list string) []string { return strings.Split(list, ":") }
	context.IsDir = func(path string) bool { fmt.Printf("context.IsDir %s\n", path); return false }
	context.HasSubdir = func(root, dir string) (rel string, ok bool) {
		fmt.Printf("context.HasSubdir %s %s\n", root, dir)
		return "", false
	}
	context.ReadDir = func(dir string) (fi []os.FileInfo, err error) {
		fmt.Printf("context.ReadDir %s\n", dir)
		return fs.ReadDir(dir)
	}
	context.OpenFile = func(path string) (r io.ReadCloser, err error) {
		fmt.Printf("context.OpenFile %s\n", path)
		path = "./" + strings.TrimPrefix(path, "/src/github.com/shurcooL/Hover")
		return fs.Open(path)
	}

	bpkg2, err := context.ImportDir(".", 0)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	fmt.Fprintln(w, bpkg2.ImportPath)
	fmt.Fprintln(w, bpkg2.Dir)
	fmt.Fprintln(w, bpkg2.GoFiles)
}
