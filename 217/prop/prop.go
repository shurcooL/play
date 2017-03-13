package prop

import (
	"github.com/shurcooL/play/31/vecty"
	"golang.org/x/net/html/atom"
)

func Class(class string) vecty.Markup {
	return vecty.Property(atom.Class, class)
}
