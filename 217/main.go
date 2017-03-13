// Experiment with a vecty-like API for backend HTML rendering.
package main

import (
	"fmt"
	"log"
	"os"

	"github.com/shurcooL/play/31/elem"
	"github.com/shurcooL/play/31/prop"
	"github.com/shurcooL/play/31/vecty"
	"golang.org/x/net/html/atom"
)

func main() {
	err := run()
	if err != nil {
		log.Fatalln(err)
	}
}

func run() error {
	c := &CommitID{ID: "abcdef1234567890"}
	err := vecty.Render(os.Stdout, c)
	if err != nil {
		return err
	}
	fmt.Println()
	return nil
}

// CommitID is a component that displays a short commit ID, with the full one available in tooltip.
type CommitID struct {
	ID string
}

func (c *CommitID) Render() *vecty.HTML {
	return elem.Abbreviation(
		vecty.Property(atom.Title, c.ID),
		elem.Code(
			prop.Class("commitID"),
			vecty.Text(c.commitID()),
		),
	)
}

func (c *CommitID) commitID() string { return c.ID[:8] }
