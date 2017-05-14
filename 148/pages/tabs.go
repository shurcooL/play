// Package pages contains code to render pages, used from backend and frontend.
package pages

import (
	"html/template"
	"net/url"

	"github.com/shurcooL/htmlg"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// Tabs renders the html for <nav> element with tab header links.
func Tabs(query url.Values) template.HTML {
	selectedTab := query.Get("tab")

	var ns []*html.Node

	for _, tab := range []struct {
		id   string
		name string
	}{{"", "Tab 1"}, {"2", "Tab 2"}, {"3", "Tab 3"}} {
		a := &html.Node{Type: html.ElementNode, Data: atom.A.String()}
		if tab.id == selectedTab {
			a.Attr = []html.Attribute{{Key: "class", Val: "selected"}}
		} else {
			u := url.URL{Path: "/"}
			if tab.id != "" {
				u.RawQuery = url.Values{"tab": {tab.id}}.Encode()
			}
			a.Attr = []html.Attribute{
				{Key: atom.Href.String(), Val: u.String()},
				{Key: atom.Onclick.String(), Val: "SwitchTab(event, this);"},
			}
		}
		a.AppendChild(htmlg.Text(tab.name))
		ns = append(ns, a)
	}

	return template.HTML(htmlg.Render(ns...))
}
