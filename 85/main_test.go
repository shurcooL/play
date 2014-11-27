package main_test

import (
	"bytes"
	"fmt"
	"html/template"
	"path"
	"strings"

	"golang.org/x/net/html"
)

func Example() {
	inputs := []struct {
		repoImportPath string
		importPath     string
	}{
		{"github.com/shurcooL/go", "github.com/shurcooL/go/u/u10"},
		{"rsc.io/pd&f", "rsc.io/pd&f"},
		{"rsc.io/pdf", "rsc.io/pdf"},
		{"rsc.io/pdf", "rsc.io/pdf/pdfpasswd"},
	}

	for _, i := range inputs {
		out1 := approach1(i.repoImportPath, i.importPath)
		out2 := approach2(i.repoImportPath, i.importPath)

		if out1 != out2 {
			panic(fmt.Errorf("out1 != out2\n%q\n%q\n", out1, out2))
		}

		fmt.Println(out1)
	}

	// Output:
	//<a href="/github.com/shurcooL/go">github.com/shurcooL/go</a>/<a href="/github.com/shurcooL/go/u">u</a>/u10
	//rsc.io/pd&amp;f
	//rsc.io/pdf
	//<a href="/rsc.io/pdf">rsc.io/pdf</a>/pdfpasswd
}

func approach1(repoImportPath, importPath string) string {
	data := struct {
		ImportPathElements [][2]string // Element name, and full path to element.
	}{}

	{
		elements := strings.Split(importPath, "/")
		elements = elements[len(strings.Split(repoImportPath, "/")):]

		data.ImportPathElements = [][2]string{
			[2]string{repoImportPath, repoImportPath},
		}
		for i, e := range elements {
			data.ImportPathElements = append(data.ImportPathElements,
				[2]string{e, repoImportPath + "/" + path.Join(elements[:i+1]...)},
			)
		}
		// Don't link the last element, since it's the current page.
		data.ImportPathElements[len(data.ImportPathElements)-1][1] = ""
	}

	t, err := template.New("import-path.html.tmpl").Parse(`{{define "ImportPath"}}{{range $i, $v := .}}{{if $i}}/{{end}}{{if (index $v 1)}}<a href="/{{(index $v 1)}}">{{(index $v 0)}}</a>{{else}}{{(index $v 0)}}{{end}}{{end}}{{end}}`)
	if err != nil {
		panic(err)
	}

	var buf bytes.Buffer
	err = t.ExecuteTemplate(&buf, "ImportPath", data.ImportPathElements)
	if err != nil {
		panic(err)
	}

	return buf.String()
}

func text(s string) *html.Node {
	return &html.Node{
		Type: html.TextNode, Data: s,
	}
}

func a(s string, href template.URL) *html.Node {
	return &html.Node{
		Type: html.ElementNode, Data: "a",
		Attr:       []html.Attribute{{Key: "href", Val: string(href)}},
		FirstChild: text(s),
	}
}

func approach2(repoImportPath, importPath string) string {
	// Elements of importPath, first element being repoImportPath.
	// E.g., {"github.com/user/repo", "subpath", "package"}.
	elements := []string{repoImportPath}
	elements = append(elements, strings.Split(importPath[len(repoImportPath):], "/")[1:]...)

	var ns []*html.Node
	for i, element := range elements {
		if i != 0 {
			ns = append(ns, text("/"))
		}

		path := path.Join(elements[:i+1]...)

		// Don't link last importPath element, since it's the current page.
		if path != importPath {
			ns = append(ns, a(element, template.URL("/"+path)))
		} else {
			ns = append(ns, text(element))
		}
	}

	var buf bytes.Buffer
	for _, n := range ns {
		err := html.Render(&buf, n)
		if err != nil {
			panic(err)
		}
	}

	return buf.String()
}
