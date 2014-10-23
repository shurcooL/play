package main

import (
	"fmt"
	"strings"
)

type word string

func (w word) String() string { return string(w) }
func (w word) Title() string  { return strings.Title(string(w)) }

type sentence struct {
	words []word
}

func (s sentence) String() string {
	var out string = s.words[0].Title()
	for _, word := range s.words[1:] {
		out += " " + word.String()
	}
	out += "."
	return out
}

func main() {
	s := sentence{
		words: []word{"this", "update", "is", "recommended", "for", "all", "users"},
	}

	fmt.Println(s.String())
}
