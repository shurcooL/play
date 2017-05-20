// Experiment with a vecty-like API for backend HTML rendering.
package main

import (
	"fmt"
	"log"
	"os"

	"github.com/shurcooL/play/217/attr"
	"github.com/shurcooL/play/217/elem"
	"github.com/shurcooL/play/217/vec"
)

func main() {
	err := run()
	if err != nil {
		log.Fatalln(err)
	}
}

func run() error {
	c := &CommitID{ID: "abcdef1234567890"}
	err := vec.Render(os.Stdout, c)
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

func (c *CommitID) Render() *vec.HTML {
	/*
		<abbr title="{{.ID}}">
			<code class="commitID">
				{{.commitID}}
			</code>
		</abbr>
	*/
	return elem.Abbr(attr.Title(c.ID),
		elem.Code(attr.Class("commitID"),
			c.commitID(),
		),
	)
}

func (c *CommitID) commitID() string { return c.ID[:8] }
