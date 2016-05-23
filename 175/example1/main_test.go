package main

import (
	"reflect"
	"testing"

	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

func Test(t *testing.T) {
	openBadgeOld := func() []*html.Node {
		n := &html.Node{
			Type: html.ElementNode, Data: atom.Span.String(),
			Attr: []html.Attribute{
				{Key: atom.Class.String(), Val: "open-badge"},
			},
		}
		n.AppendChild(
			&html.Node{
				Type: html.ElementNode, Data: atom.Span.String(),
				Attr: []html.Attribute{
					{Key: atom.Class.String(), Val: "octicon octicon-issue-opened"},
				},
			},
		)
		n.AppendChild(&html.Node{
			Type: html.TextNode, Data: " Open",
		})
		return []*html.Node{n}
	}

	if got, want := openBadge(), openBadgeOld(); !reflect.DeepEqual(got, want) {
		t.Errorf("\ngot  %+v\nwant %+v", got, want)
	}
}
