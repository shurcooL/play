package vecty

import (
	"fmt"
	"io"

	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

type HTML struct {
	Children []*HTML

	Type     html.NodeType
	DataAtom atom.Atom
	Data     string

	Attr map[atom.Atom]string
}

type Component interface {
	Render() *HTML
}

func Render(w io.Writer, c Component) error {
	h := c.Render()
	err := renderHTML(w, h)
	return err
}

func renderHTML(w io.Writer, h *HTML) error {
	switch h.Type {
	case html.TextNode:
		_, err := io.WriteString(w, html.EscapeString(h.Data))
		return err
	case html.ElementNode:
		_, err := io.WriteString(w, "<")
		if err != nil {
			return err
		}
		_, err = io.WriteString(w, h.DataAtom.String())
		if err != nil {
			return err
		}

		for key, value := range h.Attr {
			_, err = io.WriteString(w, " ")
			if err != nil {
				return err
			}
			_, err = io.WriteString(w, key.String())
			if err != nil {
				return err
			}
			_, err = io.WriteString(w, `="`)
			if err != nil {
				return err
			}
			_, err = io.WriteString(w, html.EscapeString(value))
			if err != nil {
				return err
			}
			_, err = io.WriteString(w, `"`)
			if err != nil {
				return err
			}
		}

		_, err = io.WriteString(w, ">")
		if err != nil {
			return err
		}

		for _, c := range h.Children {
			err = renderHTML(w, c)
			if err != nil {
				return err
			}
		}

		_, err = io.WriteString(w, "</")
		if err != nil {
			return err
		}
		_, err = io.WriteString(w, h.DataAtom.String())
		if err != nil {
			return err
		}
		_, err = io.WriteString(w, ">")
		return err
	default:
		panic(fmt.Errorf("unknown node type %v (%T)", h.Type, h.Type))
	}
}

type MarkupOrComponentOrHTML interface{}

type Markup func(h *HTML)

func Apply(h *HTML, m MarkupOrComponentOrHTML) {
	switch m := m.(type) {
	case Markup:
		m(h)
	case *HTML:
		h.Children = append(h.Children, m)
	default:
		panic(fmt.Sprintf("invalid type %T does not match MarkupOrComponentOrHTML interface", m))
	}
}

func Text(s string) *HTML {
	return &HTML{
		Type: html.TextNode,
		Data: s,
	}
}

func Property(key atom.Atom, value string) Markup {
	return func(h *HTML) {
		if h.Attr == nil {
			h.Attr = make(map[atom.Atom]string)
		}
		h.Attr[key] = value
	}
}
