// Play with a simple typed representation of words, sentences, etc.
package main

import (
	"fmt"
	"net/url"
	"strings"
)

// Word is an single element of a sentence.
type Word interface {
	String() string // Normal word representation.
	Title() string  // Title word representation, used for first word in sentence.
}

// word is a simlpe English word. It's always represented using lowercase letters.
type word string

func (w word) String() string { return string(w) }
func (w word) Title() string  { return strings.Title(string(w)) }

// link is a URL.
type link struct {
	url.URL
}

func (u link) String() string { return u.URL.String() }
func (u link) Title() string  { return u.String() }

// mention a username.
type mention struct {
	username string
}

func (m mention) String() string { return "@" + m.username }
func (m mention) Title() string  { return m.String() }

// sentence is a collection of words.
type sentence struct {
	words []Word // Must contain at least 1 entry.
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
	{
		s := sentence{
			words: []Word{word("this"), word("update"), word("is"), word("recommended"), word("for"), word("all"), word("users")},
		}
		fmt.Println(s.String())
	}

	{
		s := sentence{
			words: []Word{word("please"), word("download"), word("it"), word("from"), link{url.URL{Scheme: "https", Host: "www.example.com", Path: "/that/file.zip"}}},
		}
		fmt.Println(s.String())
	}

	{
		s := sentence{
			words: []Word{link{url.URL{Scheme: "https", Host: "www.example.com", Path: "/that/page.html"}}, word("has"), word("interesting"), word("content")},
		}
		fmt.Println(s.String())
	}

	{
		s := sentence{
			words: []Word{mention{"shurcooL"}, word("is"), word("considering"), word("the"), word("implications")},
		}
		fmt.Println(s.String())
	}
}
