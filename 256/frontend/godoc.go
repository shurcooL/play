package main

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"go/ast"
	"go/doc"
	"go/parser"
	"go/token"
	"io/ioutil"
	"os"
	"path"
	"strconv"
	"strings"
	"syscall/js"
	"time"

	"github.com/shurcooL/component"
	"github.com/shurcooL/go/printerutil"
	"github.com/shurcooL/htmlg"
	issuescomponent "github.com/shurcooL/issuesapp/component"
	"github.com/shurcooL/play/256/moduleproxy"
	"golang.org/x/mod/module"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

func serveGodoc(ctx context.Context, query string, mp moduleproxy.Client) error {
	mod, pkg := parseQuery(query)

	t := time.Now()
	info, err := mp.Info(ctx, mod)
	if os.IsNotExist(err) {
		js.Global().Get("document").Get("body").Set("innerHTML", "404 Not Found")
		return nil
	} else if err != nil {
		return err
	}
	mod.Version = info.Version
	fmt.Println("mp.Info taken:", time.Since(t))

	t = time.Now()
	b, err := mp.Zip(ctx, mod)
	if err != nil {
		return err
	}
	fmt.Println("mp.Zip taken:", time.Since(t))

	t = time.Now()
	z, err := zip.NewReader(bytes.NewReader(b), int64(len(b)))
	if err != nil {
		return err
	}
	fset, d, err := computeDoc(z, mod, pkg)
	if err != nil {
		return err
	}
	fmt.Println("computeDoc taken:", time.Since(t))

	t = time.Now()
	var buf bytes.Buffer
	err = htmlg.RenderComponents(&buf,
		htmlg.NodeComponent(*htmlg.H1(htmlg.Text("package " + d.Name))),
		htmlg.NodeComponent(*htmlg.P(
			htmlg.Code(htmlg.Text("import " + strconv.Quote(d.ImportPath))),
		)),
		htmlg.NodeComponent(*htmlg.P(
			component.Join("Version ", info.Version, " from ", issuescomponent.Time{info.Time}, ".").Render()...,
		)),
		godocComponent{
			Fset:    fset,
			Package: d,
		},
	)
	if err != nil {
		return err
	}
	fmt.Println("RenderComponents taken:", time.Since(t))

	js.Global().Get("document").Get("body").Set("innerHTML", buf.String())
	return nil
}

// computeDoc computes the package documentation.
func computeDoc(z *zip.Reader, mod module.Version, pkg string) (*token.FileSet, *doc.Package, error) {
	// TODO: handle GOOS/GOARCH
	// TODO: handle build tags, "ignore", etc.
	// TODO: collect examples from _test.go files
	var (
		fset  = token.NewFileSet()
		files = make(map[string]*ast.File)
	)
	for _, f := range z.File {
		if path.Dir(f.Name) != path.Join(mod.Path+"@"+mod.Version, pkg) {
			// Wrong dir.
			continue
		}
		if !strings.HasSuffix(f.Name, ".go") || strings.HasSuffix(f.Name, "_test.go") {
			// Non-.go file.
			continue
		}
		b, err := readFile(f)
		if err != nil {
			return nil, nil, err
		}
		pf, err := parser.ParseFile(fset, f.Name, b, parser.ParseComments)
		if err != nil {
			return nil, nil, err
		}
		files[f.Name] = pf
	}
	var packageName string
	for _, f := range files {
		packageName = f.Name.String() // TODO: handle mismatching package names
		break
	}
	apkg := &ast.Package{
		Name:  packageName,
		Files: files,
	}
	return fset, doc.New(apkg, path.Join(mod.Path, pkg), 0), nil // TODO
}

func readFile(f *zip.File) ([]byte, error) {
	rc, err := f.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	return ioutil.ReadAll(rc)
}

type godocComponent struct {
	Fset *token.FileSet
	*doc.Package
}

func (p godocComponent) Render() []*html.Node {
	ns := []*html.Node{
		htmlg.P(
			parseHTML(docHTML(p.Doc)),
		),
		htmlg.H1(htmlg.Text("Index")),
		htmlg.P(htmlg.Text("<TODO>")),
	}

	// Constants.
	if len(p.Consts) > 0 {
		ns = append(ns, htmlg.H2(htmlg.Text("Constants")))
	}
	for _, c := range p.Consts {
		ns = append(ns,
			htmlg.Pre(
				htmlg.Text(printerutil.SprintAst(p.Fset, c.Decl)),
			),
		)
	}

	// Variables.
	if len(p.Vars) > 0 {
		ns = append(ns, htmlg.H2(htmlg.Text("Variables")))
	}
	for _, v := range p.Vars {
		ns = append(ns,
			htmlg.Pre(
				htmlg.Text(printerutil.SprintAst(p.Fset, v.Decl)),
			),
			htmlg.P(
				parseHTML(docHTML(v.Doc)),
			),
		)
	}

	// Functions.
	for _, f := range p.Funcs {
		heading := htmlg.H2(htmlg.Text("func "+f.Name+" "), htmlg.A("¶", "#"+f.Name))
		heading.Attr = append(heading.Attr, html.Attribute{
			Key: atom.Id.String(), Val: f.Name,
		})
		ns = append(ns,
			heading,
			htmlg.Pre(
				htmlg.Text(printerutil.SprintAst(p.Fset, f.Decl)),
			),
			htmlg.P(
				parseHTML(docHTML(f.Doc)),
			),
		)
	}

	// Types.
	for _, t := range p.Types {
		ns = append(ns,
			htmlg.H2(htmlg.Text("type "+t.Name)),
			htmlg.Pre(
				htmlg.Text(printerutil.SprintAst(p.Fset, t.Decl)),
			),
			htmlg.P(
				parseHTML(docHTML(t.Doc)),
			),
		)
		for _, c := range t.Consts {
			ns = append(ns,
				htmlg.Pre(
					htmlg.Text(printerutil.SprintAst(p.Fset, c.Decl)),
				),
				htmlg.P(
					parseHTML(docHTML(c.Doc)),
				),
			)
		}
		for _, f := range t.Funcs {
			heading := htmlg.H2(htmlg.Text("func "+f.Name+" "), htmlg.A("¶", "#"+f.Name))
			heading.Attr = append(heading.Attr, html.Attribute{
				Key: atom.Id.String(), Val: f.Name,
			})
			ns = append(ns,
				heading,
				htmlg.Pre(
					htmlg.Text(printerutil.SprintAst(p.Fset, f.Decl)),
				),
				htmlg.P(
					parseHTML(docHTML(f.Doc)),
				),
			)
		}
		for _, m := range t.Methods {
			ns = append(ns,
				htmlg.H3(htmlg.Text("func ("+m.Recv+") "+m.Name)),
				htmlg.Pre(
					htmlg.Text(printerutil.SprintAst(p.Fset, m.Decl)),
				),
				htmlg.P(
					parseHTML(docHTML(m.Doc)),
				),
			)
		}
	}

	return ns
}

// docHTML returns documentation comment text converted to formatted HTML.
func docHTML(text string) string {
	var buf bytes.Buffer
	doc.ToHTML(&buf, text, nil)
	return buf.String()
}

// TODO, HACK
func parseHTML(s string) *html.Node {
	n, err := html.Parse(strings.NewReader(s))
	if err != nil {
		panic(err)
	}
	return n
}
