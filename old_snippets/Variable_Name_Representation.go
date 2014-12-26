// +build ignore

package main

import (
	"fmt"
	"strings"
	"unicode"
)

type Stringer interface {
	String(strategy int) string
}

type Word string

func (w Word) String(strategy int) string {
	if strategy == 0 {
		return strings.Title(string(w))
	} else {
		return string(w)
	}
}

type Acronym struct {
	Letters []rune
}

func (a Acronym) String(strategy int) string {
	var out string
	for i, r := range a.Letters {
		if 0 == strategy {
			if i == 0 {
				out += string(unicode.ToUpper(r))
			} else {
				out += string(r)
			}
		} else {
			out += string(unicode.ToUpper(r))
		}
	}
	return out
}

type Name struct {
	Words []Stringer
}

func (n Name) String(strategy int) string {
	var out string
	for i, w := range n.Words {
		if 1 == strategy {
			if i != 0 {
				out += "_"
			}
		}
		out += w.String(strategy)
	}
	return out
}

func main() {
	x := Name{[]Stringer{Word("get"), Word("clipboard"), Word("string")}}
	y := Acronym{[]rune{'r', 't', 'b'}}
	z := Name{[]Stringer{Word("get"), y, Word("clipboard"), Word("string")}}

	fmt.Println(x.String(0))
	fmt.Println(y.String(0))
	fmt.Println(z.String(0))
	fmt.Println()
	fmt.Println(x.String(1))
	fmt.Println(y.String(1))
	fmt.Println(z.String(1))
}
