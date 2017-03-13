package elem

import (
	"github.com/shurcooL/play/31/vecty"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

func Abbreviation(markup ...vecty.MarkupOrComponentOrHTML) *vecty.HTML {
	h := &vecty.HTML{
		Type:     html.ElementNode,
		DataAtom: atom.Abbr,
	}
	for _, m := range markup {
		vecty.Apply(h, m)
	}
	return h
}

func Code(markup ...vecty.MarkupOrComponentOrHTML) *vecty.HTML {
	h := &vecty.HTML{
		Type:     html.ElementNode,
		DataAtom: atom.Code,
	}
	for _, m := range markup {
		vecty.Apply(h, m)
	}
	return h
}
