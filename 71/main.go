package main

import (
	"fmt"
	"net/url"
	"strings"
)

type Word interface {
	String() string
	Title() string
}

type word string

func (w word) String() string { return string(w) }
func (w word) Title() string  { return strings.Title(string(w)) }

type link struct {
	url.URL
}

func (u link) String() string { return u.URL.String() }
func (u link) Title() string  { return u.URL.String() }

type sentence struct {
	words []Word
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
			words: []Word{link{url.URL{Scheme: "https", Host: "www.example.com", Path: "/that/file.zip"}}, word("has"), word("interesting"), word("content")},
		}
		fmt.Println(s.String())
	}
}
