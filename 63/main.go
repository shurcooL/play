package main

import (
	"bytes"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"go/ast"
	"go/build"
	"go/parser"
	"go/printer"
	"go/token"

	"code.google.com/p/go.tools/godoc/vfs"
	"github.com/shurcooL/go-goon"
	"github.com/shurcooL/go/exp/11"
	"github.com/shurcooL/go/gists/gist5639599"
	"github.com/shurcooL/go/gopherjs_http"
	"github.com/shurcooL/go/markdown_http"
	"github.com/shurcooL/go/raw_file_server"
	vcs2 "github.com/shurcooL/go/vcs"
	"github.com/shurcooL/go/vfs_util"
	"github.com/sourcegraph/annotate"
	"github.com/sourcegraph/apiproxy"
	"github.com/sourcegraph/apiproxy/service/github"
	"github.com/sourcegraph/go-vcs/vcs"
	"github.com/sourcegraph/httpcache"
	"github.com/sourcegraph/vcsstore/vcsclient"
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
	cacheClient := &http.Client{Transport: transport}

	sg = vcsclient.New(&url.URL{Scheme: "http", Host: "vcsstore.sourcegraph.com"}, cacheClient)

	http.Handle("/parser/", http.StripPrefix("/parser", http.HandlerFunc(parserHandler)))
	http.Handle("/inline/", http.StripPrefix("/inline", markdown_http.MarkdownHandlerFunc(inlineHandler)))
	http.Handle("/raw/", http.StripPrefix("/raw", rawHandler()))                                     // DEBUG.
	http.Handle("/bpkg/", http.StripPrefix("/bpkg", markdown_http.MarkdownHandlerFunc(bpkgHandler))) // DEBUG.
	http.Handle("/command-r.go.js", gopherjs_http.GoFiles("../56/script.go"))
	http.HandleFunc("/command-r.css", func(w http.ResponseWriter, r *http.Request) { http.ServeFile(w, r, "../56/style.css") })
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

	fs = vfs_util.NewDebugFS(fs)

	return raw_file_server.New(fs)
}

func bpkgHandler(req *http.Request) ([]byte, error) {
	var w = new(bytes.Buffer)

	bpkg, _, err := try(req)
	if err != nil {
		return nil, err
	}

	fmt.Fprintln(w, "```")
	fmt.Fprintln(w, bpkg.ImportPath)
	fmt.Fprintln(w, bpkg.Dir)
	fmt.Fprintln(w, append(bpkg.GoFiles, bpkg.CgoFiles...))
	fmt.Fprintln(w, "```")

	return w.Bytes(), nil
}

func parserHandler(w http.ResponseWriter, req *http.Request) {
	importPath := req.URL.Path[1:]
	rev := req.URL.Query().Get("rev")
	_, _ = importPath, rev

	bpkg, fs, err := try(req)
	if err != nil {
		panic(err)
	}

	/*fset, merged, err := merge(bpkg, fs)
	_ = fset
	if err != nil {
		panic(err)
	}*/

	io.WriteString(w, `<html>
	<head>
		<link href="https://assets-cdn.github.com/assets/github-043670bf5d45762c99c890603216d8776470fa11262837b5ba8ca37f4175d357.css" media="all" rel="stylesheet" type="text/css" />
		<link href="/command-r.css" media="all" rel="stylesheet" type="text/css" />
		<style>
			.highlight h3 {
				display: inline;
				font-size: inherit;
				margin-top: 0;
				margin-bottom: 0;
				font-weight: normal;
			}
		</style>
	</head>
	<body>
		<article class="markdown-body entry-content" style="padding: 30px;">`)

	fmt.Fprintln(w, "<pre><code>")
	fmt.Fprintln(w, "# "+importPath)
	fmt.Fprintln(w)
	for _, goFile := range append(bpkg.GoFiles, bpkg.CgoFiles...) {
		fmt.Fprintln(w, "-\t"+goFile)
	}
	fmt.Fprintln(w, `</code></pre>`)

	for _, goFile := range append(bpkg.GoFiles, bpkg.CgoFiles...) {
		fset := token.NewFileSet()
		file, err := fs.Open(path.Join(bpkg.Dir, goFile))
		if err != nil {
			panic(err)
		}
		merged, err := parser.ParseFile(fset, filepath.Join(bpkg.Dir, goFile), file, parser.ParseComments)
		if err != nil {
			panic(err)
		}

		var anns annotate.Annotations
		for _, decl := range merged.Decls {
			switch d := decl.(type) {
			case *ast.FuncDecl:
				pos := fset.File(d.Pos()).Offset(d.Pos())
				funcDeclSignature := &ast.FuncDecl{Recv: d.Recv, Name: d.Name, Type: d.Type}
				name := d.Name.String()
				if d.Recv != nil {
					name = strings.TrimPrefix(gist5639599.SprintAstBare(d.Recv.List[0].Type), "*") + "." + name
				}
				//fmt.Fprintln(w, pos, d.Name.String(), gist5639599.SprintAstBare(funcDeclSignature))
				ann := &annotate.Annotation{
					Start: pos,
					End:   pos + len(gist5639599.SprintAstBare(funcDeclSignature)),

					Left:  []byte(fmt.Sprintf(`<h3 id="%s">`, name)),
					Right: []byte(`</h3>`),
				}
				anns = append(anns, ann)
			}
		}

		var buf bytes.Buffer
		err = (&printer.Config{Mode: printer.UseSpaces | printer.TabIndent, Tabwidth: 8}).Fprint(&buf, fset, merged)
		if err != nil {
			panic(err)
		}

		b, err := annotate.Annotate(buf.Bytes(), anns, nil)
		if err != nil {
			panic(err)
		}

		io.WriteString(w, `<div class="highlight highlight-Go"><pre>`)
		w.Write(b)
		io.WriteString(w, `</pre></div>`)
	}

	io.WriteString(w, `</article>`)
	io.WriteString(w, `<script type="text/javascript" src="/command-r.go.js"></script>`)
	io.WriteString(w, `</body></html>`)
}

func inlineHandler(req *http.Request) ([]byte, error) {
	importPath := req.URL.Path[1:]
	rev := req.URL.Query().Get("rev")
	_ = rev

	var w = new(bytes.Buffer)

	/*repo, commitId, err := repoFromRequest(req)
	if err != nil {
		return nil, err
	}

	var fs vfs.FileSystem
	fs, err = repo.FileSystem(commitId)
	if err != nil {
		return nil, err
	}*/

	/*fs := vfs.OS("")

	fs = vfs_util.NewDebugFS(fs)

	context := buildContextUsingFS(fs)

	bpkg, err := context.Import(importPath, "", 0)
	if err != nil {
		return nil, err
	}*/

	bpkg, fs, err := try(req)
	if err != nil {
		return nil, err
	}

	fmt.Fprintln(w, "# "+importPath)
	fmt.Fprintln(w)
	for _, goFile := range append(bpkg.GoFiles, bpkg.CgoFiles...) {
		fmt.Fprintln(w, "-\t"+goFile)
	}
	fmt.Fprintln(w)

	fset, merged, err := merge(bpkg, fs)
	if err != nil {
		return nil, err
	}

	fmt.Fprintln(w, "```Go")
	exp11.WriteMergedPackage(w, fset, merged)
	fmt.Fprintln(w, "```")

	return w.Bytes(), nil
}

func try(req *http.Request) (*build.Package, vfs.FileSystem, error) {
	importPath := req.URL.Path[1:]

	fs := vfs.OS("")

	context := buildContextUsingFS(fs)
	bpkg, err0 := context.Import(importPath, "", 0)
	if err0 == nil {
		return bpkg, fs, nil
	}

	repo, repoImportPath, commitId, err := repoFromRequest(req)
	if err != nil {
		return nil, nil, err
	}

	fs, err = repo.FileSystem(commitId)
	if err != nil {
		return nil, nil, err
	}

	fs = vfs_util.NewPrefixFS(fs, "/virtual-go-workspace/src/"+repoImportPath)

	context = buildContextUsingFS(fs)
	context.GOPATH = "/virtual-go-workspace"
	bpkg, err1 := context.Import(importPath, "", 0)
	if err1 == nil {
		return bpkg, fs, nil
	}

	return nil, nil, MultiError{err0, err1}
}

func merge(bpkg *build.Package, fs vfs.FileSystem) (*token.FileSet, *ast.File, error) {
	var fset = token.NewFileSet()
	var apkg *ast.Package
	{
		filenames := append(bpkg.GoFiles, bpkg.CgoFiles...)
		files := make(map[string]*ast.File, len(filenames))
		for _, filename := range filenames {
			file, err := fs.Open(path.Join(bpkg.Dir, filename))
			if err != nil {
				return nil, nil, err
			}
			fileAst, err := parser.ParseFile(fset, filepath.Join(bpkg.Dir, filename), file, parser.ParseComments)
			if err != nil {
				return nil, nil, err
			}
			files[filename] = fileAst // TODO: Figure out if filename or full path are to be used (the key of this map doesn't seem to be used anywhere!)
		}
		apkg = &ast.Package{Name: bpkg.Name, Files: files}
	}

	const astMergeMode = 0*ast.FilterFuncDuplicates | 0*ast.FilterUnassociatedComments | ast.FilterImportDuplicates
	merged := ast.MergePackageFiles(apkg, astMergeMode)

	return fset, merged, nil
}

func importPathToRepoGuess(importPath string) (repoImportPath string, cloneUrl *url.URL, vcsRepo vcs2.Vcs, err error) {
	switch {
	case strings.HasPrefix(importPath, "github.com/"):
		importPathElements := strings.Split(importPath, "/")
		if len(importPathElements) < 3 {
			return "", nil, nil, err
		}

		repoImportPath = path.Join(importPathElements[:3]...)

		cloneUrl, err = url.Parse("https://" + repoImportPath)
		if err != nil {
			return "", nil, nil, err
		}

		return repoImportPath, cloneUrl, vcs2.NewFromType(vcs2.Git), nil
	case strings.HasPrefix(importPath, "code.google.com/p/"):
		importPathElements := strings.Split(importPath, "/")
		if len(importPathElements) < 3 {
			return "", nil, nil, err
		}

		repoImportPath = path.Join(importPathElements[:3]...)

		cloneUrl, err = url.Parse("https://" + repoImportPath)
		if err != nil {
			return "", nil, nil, err
		}

		return repoImportPath, cloneUrl, vcs2.NewFromType(vcs2.Hg), nil
	default:
		return "", nil, nil, err
	}
}

func repoFromRequest(req *http.Request) (repo vcs.Repository, repoImportPath string, commitId vcs.CommitID, err error) {
	importPath := req.URL.Path[1:]
	rev := req.URL.Query().Get("rev")

	repoImportPath, cloneUrl, vcsRepo, err := importPathToRepoGuess(importPath)
	if err != nil {
		return nil, "", "", err
	}

	goon.DumpExpr(cloneUrl, vcsRepo, err)

	repo, err = sg.Repository(vcsRepo.Type().VcsType(), cloneUrl)
	if err != nil {
		return nil, "", "", err
	}

	if rev != "" {
		commitId, err = repo.ResolveRevision(rev)
	} else {
		commitId, err = repo.ResolveBranch(vcsRepo.GetDefaultBranch())
	}
	if err != nil {
		err1 := repo.(vcsclient.RepositoryCloneUpdater).CloneOrUpdate(vcs.RemoteOpts{})
		fmt.Println("repoFromRequest: CloneOrUpdate:", err1)
		if err1 != nil {
			return nil, "", "", MultiError{err, err1}
		}

		if rev != "" {
			commitId, err1 = repo.ResolveRevision(rev)
		} else {
			commitId, err1 = repo.ResolveBranch(vcsRepo.GetDefaultBranch())
		}
		if err1 != nil {
			return nil, "", "", MultiError{err, err1}
		}
		fmt.Println("repoFromRequest: worked on SECOND try")
	} else {
		fmt.Println("repoFromRequest: worked on first try")
	}

	return repo, repoImportPath, commitId, nil
}

func buildContextUsingFS(fs vfs.FileSystem) build.Context {
	var context build.Context = build.Default

	//context.GOROOT = ""
	//context.GOPATH = "/"
	context.JoinPath = path.Join
	context.IsAbsPath = path.IsAbs
	context.SplitPathList = func(list string) []string { return strings.Split(list, ":") }
	context.IsDir = func(path string) bool {
		fmt.Printf("context.IsDir %q\n", path)
		if fi, err := fs.Stat(path); err == nil && fi.IsDir() {
			return true
		}
		return false
	}
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
		return fs.Open(path)
	}

	return context
}

// ---

type MultiError []error

func (me MultiError) Error() string {
	var buf bytes.Buffer
	fmt.Fprintf(&buf, "%d errors:\n", len(me))
	for _, err := range me {
		fmt.Fprintln(&buf, err.Error())
	}
	return buf.String()
}
