package main

import (
	"bytes"
	"text/template"

	"github.com/shurcooL/htmlg"
	"github.com/shurcooL/octicon"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

var gosrcHTML = template.Must(template.New("").Parse(`{{define "Header" -}}
<body style="margin: 0; position: relative;">
	<header style="background-color: hsl(209, 51%, 92%);">
		<div style="max-width: 800px; margin: 0 auto 0 auto; padding: 0 15px 0 15px;">
			<a class="black" href="/"><strong style="padding: 15px 0 15px 0; display: inline-block;">Go Source</strong></a>
		</div>
	</header>

	<main style="max-width: 800px; margin: 0 auto 0 auto; padding: 0 15px 120px 15px;">
		{{end}}

		{{define "Trailer"}}
	</main>

	<footer style="background-color: hsl(209, 51%, 92%); position: absolute; bottom: 0; left: 0; right: 0;">
		<div style="max-width: 800px; margin: 0 auto 0 auto; padding: 0 15px 0 15px; text-align: right;">
			<span style="padding: 15px 0 15px 0; display: inline-block;"><a href="https://github.com/shurcooL/gtdo/issues">Website Issues</a></span>
		</div>
	</footer>
</body>
{{- end}}`))

type heading struct{ Pkg string }

func (h heading) Render() []*html.Node {
	h1 := &html.Node{
		Type: html.ElementNode, Data: atom.H1.String(),
		Attr:       []html.Attribute{{Key: atom.Style.String(), Val: "margin-top: 30px;"}},
		FirstChild: htmlg.Text(h.Pkg),
	}
	return []*html.Node{h1}
}

// =====

// TODO: clean

type versions struct {
	Versions []string
	Selected string
}

func (v versions) Render() []*html.Node {
	// TODO: Make this much nicer.
	/*
		<p>
			<span class="spacing" title="Branch">
				<span style="margin-right: 8px;">{{octicon "git-branch"}}</span>
				{{SelectMenuHTML .Versions}}
			</span>
		</p>
	*/
	span := &html.Node{
		Type: html.ElementNode, Data: atom.Span.String(),
		Attr: []html.Attribute{
			{Key: atom.Class.String(), Val: "spacing"},
			{Key: atom.Title.String(), Val: "Branch"},
		},
	}
	span.AppendChild(&html.Node{
		Type: html.ElementNode, Data: atom.Span.String(),
		FirstChild: octicon.GitBranch(),
	})
	span.AppendChild(SelectMenuHTML(v.Versions, v.Selected))
	return []*html.Node{htmlg.P(span)}
}

// SelectMenuHTML creates the HTML for a select menu instance with the specified parameters.
func SelectMenuHTML(options []string, selectedOption string) *html.Node {
	selectElement := &html.Node{Type: html.ElementNode, Data: "select"}
	if !contains(options, selectedOption) {
		options = append(options, selectedOption)
	}
	for _, option := range options {
		o := &html.Node{Type: html.ElementNode, Data: "option"}
		o.AppendChild(htmlg.Text(option))
		if option == selectedOption {
			o.Attr = append(o.Attr, html.Attribute{Key: atom.Selected.String()})
		}
		selectElement.AppendChild(o)
	}
	return selectElement
}

func contains(ss []string, t string) bool {
	for _, s := range ss {
		if s == t {
			return true
		}
	}
	return false
}

var linkOcticon string = func() string {
	var buf bytes.Buffer
	err := html.Render(&buf, octicon.Link())
	if err != nil {
		panic(err)
	}
	return buf.String()
}()
