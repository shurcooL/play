package main

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io"
	"io/ioutil"
	"os"
	"path"
	"sort"
	"strconv"
	"strings"
	"syscall/js"
	"text/template"

	"github.com/shurcooL/component"
	"github.com/shurcooL/go/printerutil"
	"github.com/shurcooL/highlight_go"
	"github.com/shurcooL/htmlg"
	issuescomponent "github.com/shurcooL/issuesapp/component"
	"github.com/shurcooL/play/256/moduleproxy"
	"github.com/shurcooL/play/258/frontend/sanitizedanchorname"
	"github.com/sourcegraph/annotate"
	"golang.org/x/net/html"
)

func serveGosrc(ctx context.Context, query string, mp moduleproxy.Client) error {
	mod, pkg := parseQuery(query)

	// Resolve module query to a specific module version.
	info, err := mp.Info(ctx, mod)
	if os.IsNotExist(err) {
		js.Global().Get("document").Get("body").Set("innerHTML", "404 Not Found")
		return nil
	} else if err != nil {
		return fmt.Errorf("mp.Info: %v", err)
	}
	mod.Version = info.Version

	// List versions.
	list, err := mp.List(ctx, mod.Path)
	if err != nil {
		return err
	}

	// Fetch .zip.
	b, err := mp.Zip(ctx, mod)
	if err != nil {
		return err
	}

	// Extract .go files.
	//z, err := zip.NewReader(bytes.NewReader(b), int64(len(b)))
	z, err := zip.NewReader(debugReaderAt{bytes.NewReader(b)}, int64(len(b))) // XXX.
	if err != nil {
		return err
	}
	var goFiles []file // Sorted by name.
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
			return err
		}
		goFiles = append(goFiles, file{
			Name: path.Base(f.Name),
			Src:  b,
		})
	}
	sort.Slice(goFiles, func(i, j int) bool { return goFiles[i].Name < goFiles[j].Name })

	// Render page body HTML.
	var buf bytes.Buffer
	err = gosrcHTML.ExecuteTemplate(&buf, "Header", nil)
	if err != nil {
		return err
	}
	err = htmlg.RenderComponents(&buf,
		heading{Pkg: path.Join(mod.Path, pkg)},
		htmlg.NodeComponent(*htmlg.P(
			component.Join("Version ", mod.Version, " from ", issuescomponent.Time{info.Time}, ".").Render()...,
		)),
		versions{Versions: list, Selected: mod.Version},
	)
	if err != nil {
		return err
	}
	for _, f := range goFiles {
		err := renderFile(&buf, f)
		if err != nil {
			return err
		}
	}
	err = gosrcHTML.ExecuteTemplate(&buf, "Trailer", nil)
	if err != nil {
		return err
	}

	js.Global().Get("document").Get("body").Set("outerHTML", buf.String())
	return nil
}

type file struct {
	Name string
	Src  []byte
}

// TODO: clean
func renderFile(w *bytes.Buffer, f file) error {
	const maxAnnotateSize = 1000 * 1000

	var (
		annSrc           []byte
		shouldHTMLEscape bool
	)
	switch {
	case len(f.Src) <= maxAnnotateSize:
		fset := token.NewFileSet()
		fileAst, _ := parser.ParseFile(fset, "", f.Src, parser.ParseComments)

		anns, err := highlight_go.Annotate(f.Src, htmlAnnotator)
		_ = err // TODO: Deal with returned error.

		for _, decl := range fileAst.Decls {
			switch d := decl.(type) {
			case *ast.FuncDecl:
				name := d.Name.String()
				if d.Recv != nil {
					name = strings.TrimPrefix(printerutil.SprintAstBare(d.Recv.List[0].Type), "*") + "." + name
					anns = append(anns, annotateNodes(fset, d.Recv, d.Name, fmt.Sprintf(`<h3 id="%s">`, name), `</h3>`, 1))
				} else {
					anns = append(anns, annotateNode(fset, d.Name, fmt.Sprintf(`<h3 id="%s">`, name), `</h3>`, 1))
				}
				anns = append(anns, annotateNode(fset, d.Name, fmt.Sprintf(`<a href="%s">`, "#"+name), `</a>`, 2))
			case *ast.GenDecl:
				switch d.Tok {
				case token.IMPORT:
					for _, imp := range d.Specs {
						pathLit := imp.(*ast.ImportSpec).Path
						pathValue, err := strconv.Unquote(pathLit.Value)
						if err != nil {
							continue
						}
						anns = append(anns, annotateNode(fset, pathLit, fmt.Sprintf(`<a href="/%s">`, pathValue), `</a>`, 1))
					}
				case token.TYPE:
					for _, spec := range d.Specs {
						ident := spec.(*ast.TypeSpec).Name
						anns = append(anns, annotateNode(fset, ident, fmt.Sprintf(`<h3 id="%s">`, ident.String()), `</h3>`, 1))
						anns = append(anns, annotateNode(fset, ident, fmt.Sprintf(`<a href="%s">`, "#"+ident.String()), `</a>`, 2))
					}
				case token.CONST, token.VAR:
					for _, spec := range d.Specs {
						for _, ident := range spec.(*ast.ValueSpec).Names {
							anns = append(anns, annotateNode(fset, ident, fmt.Sprintf(`<h3 id="%s">`, ident.String()), `</h3>`, 1))
							anns = append(anns, annotateNode(fset, ident, fmt.Sprintf(`<a href="%s">`, "#"+ident.String()), `</a>`, 2))
						}
					}
				}
			}
		}

		sort.Sort(anns)

		annSrc, err = annotate.Annotate(f.Src, anns, template.HTMLEscape)
		if err != nil {
			panic(err)
		}
		shouldHTMLEscape = false
	default:
		// Skip annotation for huge files.
		annSrc = f.Src
		shouldHTMLEscape = true
	}

	lineCount := bytes.Count(f.Src, []byte("\n"))
	fmt.Fprintf(w, `<div><h2 id="%s">%s<a class="anchor" onclick="MustScrollTo(event, &#34;\&#34;%s\&#34;&#34;);"><span class="anchor-icon">%s</span></a></h2>`, sanitizedanchorname.Create(f.Name), html.EscapeString(f.Name), sanitizedanchorname.Create(f.Name), linkOcticon) // HACK.
	io.WriteString(w, `<div class="highlight">`)
	io.WriteString(w, `<div class="background"></div>`)
	io.WriteString(w, `<div class="selection"></div>`)
	io.WriteString(w, `<table cellspacing=0><tr><td><pre class="ln">`)
	for i := 1; i <= lineCount; i++ {
		fmt.Fprintf(w, `<span id="%s-L%d" class="ln" onclick="LineNumber(event, &#34;\&#34;%s-L%d\&#34;&#34;);">%d</span>`, sanitizedanchorname.Create(f.Name), i, sanitizedanchorname.Create(f.Name), i, i)
		w.WriteString("\n")
	}
	io.WriteString(w, `</pre></td><td><pre class="file">`)
	switch shouldHTMLEscape {
	case false:
		w.Write(annSrc)
	case true:
		template.HTMLEscape(w, annSrc)
	}
	io.WriteString(w, `</pre></td></tr></table></div></div>`)
	return nil
}

func readFile(f *zip.File) ([]byte, error) {
	rc, err := f.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	return ioutil.ReadAll(rc)
}

type debugReaderAt struct {
	io.ReaderAt
}

func (r debugReaderAt) ReadAt(p []byte, off int64) (n int, err error) {
	fmt.Printf("ReadAt: at %d (len %d) end %d\n", off, len(p), off+int64(len(p)))
	return r.ReaderAt.ReadAt(p, off)
}
