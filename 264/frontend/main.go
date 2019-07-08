package main

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"strings"
	"syscall/js"

	"github.com/shurcooL/home/component"
	"github.com/shurcooL/home/exp/vec"
	"github.com/shurcooL/home/exp/vec/attr"
	"github.com/shurcooL/home/exp/vec/elem"
	"github.com/shurcooL/htmlg"
	"github.com/shurcooL/octicon"
	"github.com/shurcooL/users"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

func main() {
	var buf bytes.Buffer
	err := run(&buf)
	if err != nil {
		log.Fatalln(err)
	}
	js.Global().Get("document").Get("body").Set("innerHTML", buf.String())
}

func run(w io.Writer) error {
	h := struct {
		ImportPath string
		PkgPath    string
		DocHTML    string
		LicenseURL string
	}{
		ImportPath: "dmitri.shuralyov.com/gpu/mtl/example/movingtriangle/internal/ca",
		DocHTML:    `<p>Package ca provides access to Apple's Core Animation API (<a href="https://developer.apple.com/documentation/quartzcore">https://developer.apple.com/documentation/quartzcore</a>).</p><p>This package is in very early stages of development. It's a minimal implementation with scope limited to supporting the movingtriangle example.</p>`,
		LicenseURL: "/gpu/mtl$file/LICENSE",
	}
	h.PkgPath = strings.TrimPrefix(h.ImportPath, "dmitri.shuralyov.com")

	_, err := io.WriteString(w, `<div style="max-width: 800px; margin: 0 auto 100px auto;">`)
	if err != nil {
		return err
	}

	// Render the header.
	header := component.Header{
		CurrentUser:       users.User{},
		NotificationCount: 0,
		ReturnURL:         "/",
	}
	err = htmlg.RenderComponents(w, header)
	if err != nil {
		return err
	}

	err = htmlg.RenderComponents(w, component.PackageSelector{ImportPath: h.ImportPath})
	if err != nil {
		return err
	}

	// Render the tabnav.
	err = htmlg.RenderComponents(w, directoryTabnav(packagesTab, h.PkgPath, 1337, 1337))
	if err != nil {
		return err
	}

	err = vec.RenderHTML(w,
		elem.H1("Package ca"),
		elem.P(elem.Code(fmt.Sprintf(`import "%s"`, h.ImportPath))),
	)
	if err != nil {
		return err
	}
	if h.DocHTML != "" {
		err = vec.RenderHTML(w, elem.H3("Overview"), vec.UnsafeHTML(h.DocHTML))
		if err != nil {
			return err
		}
	}
	err = vec.RenderHTML(w,
		elem.H3("Installation"),
		elem.P(elem.Pre("go get -u "+h.ImportPath)),
		elem.H3(elem.A("Documentation", attr.Href("https://godoc.org/"+h.ImportPath))),
		elem.H3(elem.A("Code", attr.Href("https://gotools.org/"+h.ImportPath))),
		elem.H3(elem.A("License", attr.Href(h.LicenseURL))),
	)
	if err != nil {
		return err
	}

	_, err = io.WriteString(w, `</div>`)
	return err
}

func directoryTabnav(selected repositoryTab, pkgPath string, openIssues, openChanges int) htmlg.Component {
	return tabnav{
		Tabs: []tab{
			{
				Content:  iconText{Icon: octicon.Package, Text: "Package"},
				URL:      route۰PkgIndex(pkgPath),
				Selected: selected == packagesTab,
			},
			{
				Content:  iconText{Icon: octicon.History, Text: "History"},
				URL:      route۰PkgHistory(pkgPath),
				Selected: selected == historyTab,
			},
			{
				Content: contentCounter{
					Content: iconText{Icon: octicon.IssueOpened, Text: "Issues"},
					Count:   openIssues,
				},
				//URL: "", // TODO.
				Selected: selected == issuesTab,
			},
			{
				Content: contentCounter{
					Content: iconText{Icon: octicon.GitPullRequest, Text: "Changes"},
					Count:   openChanges,
				},
				//URL: "", // TODO.
				Selected: selected == changesTab,
			},
		},
	}
}

func route۰PkgIndex(pkgPath string) string   { return pkgPath }
func route۰PkgHistory(pkgPath string) string { return pkgPath + "$history" }

type repositoryTab uint8

const (
	noTab repositoryTab = iota
	packagesTab
	historyTab
	issuesTab
	changesTab
)

// tabnav is a left-aligned horizontal row of tabs Primer CSS component.
//
// http://primercss.io/nav/#tabnav
type tabnav struct {
	Tabs []tab
}

func (t tabnav) Render() []*html.Node {
	nav := &html.Node{
		Type: html.ElementNode, Data: atom.Nav.String(),
		Attr: []html.Attribute{{Key: atom.Class.String(), Val: "tabnav-tabs"}},
	}
	for _, t := range t.Tabs {
		htmlg.AppendChildren(nav, t.Render()...)
	}
	return []*html.Node{htmlg.DivClass("tabnav", nav)}
}

// tab is a single tab entry within a tabnav.
type tab struct {
	Content  htmlg.Component
	URL      string
	Selected bool
}

func (t tab) Render() []*html.Node {
	aClass := "tabnav-tab"
	if t.Selected {
		aClass += " selected"
	}
	a := &html.Node{
		Type: html.ElementNode, Data: atom.A.String(),
		Attr: []html.Attribute{
			{Key: atom.Href.String(), Val: t.URL},
			{Key: atom.Class.String(), Val: aClass},
		},
	}
	htmlg.AppendChildren(a, t.Content.Render()...)
	return []*html.Node{a}
}

type contentCounter struct {
	Content htmlg.Component
	Count   int
}

func (cc contentCounter) Render() []*html.Node {
	var ns []*html.Node
	ns = append(ns, cc.Content.Render()...)
	ns = append(ns, htmlg.SpanClass("counter", htmlg.Text(fmt.Sprint(cc.Count))))
	return ns
}

// iconText is an icon with text on the right.
// Icon must be not nil.
type iconText struct {
	Icon func() *html.Node // Must be not nil.
	Text string
}

func (it iconText) Render() []*html.Node {
	icon := htmlg.Span(it.Icon())
	icon.Attr = append(icon.Attr, html.Attribute{
		Key: atom.Style.String(), Val: "margin-right: 4px;",
	})
	text := htmlg.Text(it.Text)
	return []*html.Node{icon, text}
}
