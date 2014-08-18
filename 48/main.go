package main

import (
	"bytes"
	"fmt"
	"go/ast"
	"go/build"
	"go/parser"
	"go/token"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/daviddengcn/go-diff/cmd"
	"github.com/shurcooL/go/exp/11"
	"github.com/shurcooL/go/gists/gist5504644"
	"github.com/sourcegraph/go-vcs/vcs"

	conception "github.com/shurcooL/Conception-go"
)

func main() {
	http.Handle("/inline/", http.StripPrefix("/inline", conception.MarkdownHandlerFunc(handler)))
	http.Handle("/diff/", http.StripPrefix("/diff", conception.MarkdownHandlerFunc(diffHandler)))
	panic(http.ListenAndServe(":8080", nil))
}

func a(w io.Writer, req *http.Request) (vcs.Repository, error) {
	importPath := req.URL.Path[1:]

	bpkg, err := gist5504644.BuildPackageFromImportPath(importPath)
	if err != nil {
		return nil, err
	}

	fmt.Fprintln(w, "```")
	fmt.Fprintln(w, bpkg.ImportPath)
	fmt.Fprintln(w, bpkg.Dir)
	fmt.Fprintln(w, bpkg.GoFiles)
	fmt.Fprintln(w, "```")
	fmt.Fprintln(w)

	gitRepo, err := vcs.OpenGitRepository(bpkg.Dir)
	return gitRepo, err
}

func handler(req *http.Request) ([]byte, error) {
	var w = new(bytes.Buffer)

	repo, err := a(w, req)
	if err != nil {
		return nil, err
	}

	bpkg, fset, merged, err := y(repo, vcs.CommitID(req.URL.Query().Get("rev")))
	if err != nil {
		return nil, err
	}

	fmt.Fprintln(w, "```")
	fmt.Fprintln(w, bpkg.ImportPath)
	fmt.Fprintln(w, bpkg.Dir)
	fmt.Fprintln(w, bpkg.GoFiles)
	fmt.Fprintln(w, "```")
	fmt.Fprintln(w)

	fmt.Fprintln(w, "```Go")
	exp11.WriteMergedPackage(w, fset, merged)
	fmt.Fprintln(w, "```")
	return w.Bytes(), nil
}

func diffHandler(req *http.Request) ([]byte, error) {
	var w = new(bytes.Buffer)

	repo, err := a(w, req)
	if err != nil {
		return nil, err
	}

	bpkg0, fset0, merged0, err := y(repo, vcs.CommitID(req.URL.Query().Get("rev0")))
	if err != nil {
		return nil, err
	}

	bpkg1, fset1, merged1, err := y(repo, vcs.CommitID(req.URL.Query().Get("rev1")))
	if err != nil {
		return nil, err
	}

	fmt.Fprintln(w, "```")
	fmt.Fprintln(w, bpkg0.ImportPath)
	fmt.Fprintln(w, bpkg0.Dir)
	fmt.Fprintln(w, bpkg0.GoFiles)
	fmt.Fprintln(w)
	fmt.Fprintln(w, bpkg1.ImportPath)
	fmt.Fprintln(w, bpkg1.Dir)
	fmt.Fprintln(w, bpkg1.GoFiles)
	fmt.Fprintln(w, "```")
	fmt.Fprintln(w)

	fmt.Fprintln(w, "```diff")
	godiff.Exec2(w, fset0, merged0, fset1, merged1)
	fmt.Fprintln(w, "```")
	return w.Bytes(), nil
}

func y(repo vcs.Repository, commit vcs.CommitID) (*build.Package, *token.FileSet, *ast.File, error) {
	fs, err := repo.FileSystem(commit)
	if err != nil {
		return nil, nil, nil, err
	}

	return x(fs)
}

func x(fs vcs.FileSystem) (*build.Package, *token.FileSet, *ast.File, error) {
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
		path = "./" + path
		return fs.Open(path)
	}

	bpkg, err := context.ImportDir(".", 0)
	if err != nil {
		return nil, nil, nil, err
	}

	// ---

	var fset = token.NewFileSet()
	var apkg *ast.Package
	{
		filenames := append(bpkg.GoFiles, bpkg.CgoFiles...)
		files := make(map[string]*ast.File, len(filenames))
		for _, filename := range filenames {
			file, err := fs.Open("./" + filename)
			if err != nil {
				return nil, nil, nil, err
			}
			fileAst, err := parser.ParseFile(fset, filepath.Join(bpkg.Dir, filename), file, parser.ParseComments)
			if err != nil {
				return nil, nil, nil, err
			}
			files[filename] = fileAst // TODO: Figure out if filename or full path are to be used (the key of this map doesn't seem to be used anywhere!)
		}
		apkg = &ast.Package{Name: bpkg.Name, Files: files}
	}

	const astMergeMode = 0*ast.FilterFuncDuplicates | ast.FilterUnassociatedComments | ast.FilterImportDuplicates
	merged := ast.MergePackageFiles(apkg, astMergeMode)

	return bpkg, fset, merged, nil
}
