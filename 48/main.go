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

	"golang.org/x/tools/godoc/vfs"

	"github.com/daviddengcn/go-diff/cmd"
	"github.com/shurcooL/go/exp/11"
	"github.com/shurcooL/go/gists/gist5504644"
	"github.com/shurcooL/go/markdown_http"
	vcs2 "github.com/shurcooL/go/vcs"
	"sourcegraph.com/sourcegraph/go-vcs/vcs"
	_ "sourcegraph.com/sourcegraph/go-vcs/vcs/gitcmd"
)

func main() {
	http.Handle("/inline/", http.StripPrefix("/inline", markdown_http.MarkdownHandlerFunc(inlineHandler)))
	http.Handle("/diff/", http.StripPrefix("/diff", markdown_http.MarkdownHandlerFunc(diffHandler)))
	panic(http.ListenAndServe(":8080", nil))
}

func a(w io.Writer, req *http.Request) (vcs.Repository, vcs2.Vcs, error) {
	importPath := req.URL.Path[1:]

	bpkg, err := gist5504644.BuildPackageFromImportPath(importPath)
	if err != nil {
		return nil, nil, err
	}

	fmt.Fprintln(w, "```")
	fmt.Fprintln(w, bpkg.ImportPath)
	fmt.Fprintln(w, bpkg.Dir)
	fmt.Fprintln(w, bpkg.GoFiles)
	fmt.Fprintln(w, "```")
	fmt.Fprintln(w)

	// HACK: Assume git.
	vcsRepo := vcs2.NewFromType(vcs2.Git)

	gitRepo, err := vcs.Open(vcsRepo.Type().VcsType(), bpkg.Dir)
	return gitRepo, vcsRepo, err
}

func inlineHandler(req *http.Request) ([]byte, error) {
	rev := req.URL.Query().Get("rev")

	var w = new(bytes.Buffer)

	repo, vcsRepo, err := a(w, req)
	if err != nil {
		return nil, err
	}

	var commitId vcs.CommitID
	if rev != "" {
		commitId, err = repo.ResolveRevision(rev)
	} else {
		commitId, err = repo.ResolveBranch(vcsRepo.GetDefaultBranch())
	}

	fmt.Fprintln(w, "```")
	fmt.Fprintln(w, "rev:", rev)
	fmt.Fprintln(w, "commitId:", commitId)
	fmt.Fprintln(w, "```")
	fmt.Fprintln(w)

	bpkg, fset, merged, err := y(repo, commitId)
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

	repo, _, err := a(w, req)
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
	godiff.ExecWriter(w, fset0, merged0, fset1, merged1, godiff.Options{NoColor: true})
	fmt.Fprintln(w, "```")

	return w.Bytes(), nil
}

func y(repo vcs.Repository, commitId vcs.CommitID) (*build.Package, *token.FileSet, *ast.File, error) {
	return Ysubdir(repo, commitId, ".")
}

func Ysubdir(repo vcs.Repository, commitId vcs.CommitID, subdir string) (*build.Package, *token.FileSet, *ast.File, error) {
	fs, err := repo.FileSystem(commitId)
	if err != nil {
		return nil, nil, nil, err
	}

	return x(fs, subdir)
}

func x(fs vfs.FileSystem, subdir string) (*build.Package, *token.FileSet, *ast.File, error) {
	var context build.Context = build.Default
	//context.GOROOT = ""
	context.GOPATH = "/"
	context.JoinPath = path.Join
	context.IsAbsPath = path.IsAbs
	context.SplitPathList = func(list string) []string { return strings.Split(list, ":") }
	context.IsDir = func(path string) bool { fmt.Printf("context.IsDir %q\n", path); return false }
	context.HasSubdir = func(root, dir string) (rel string, ok bool) {
		fmt.Printf("context.HasSubdir %q %q\n", root, dir)
		return "", false
	}
	context.ReadDir = func(dir string) (fi []os.FileInfo, err error) {
		fmt.Printf("context.ReadDir %q\n", dir)
		return fs.ReadDir(dir)
	}
	context.OpenFile = func(path string) (r io.ReadCloser, err error) {
		fmt.Printf("context.OpenFile %q\n", path)
		path = "./" + path
		return fs.Open(path)
	}

	bpkg, err := context.ImportDir(subdir, 0) // TODO: Fix. Use real import path.
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
			file, err := fs.Open(subdir + "/" + filename) // TODO: Fix.
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
