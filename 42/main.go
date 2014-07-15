package main

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/shurcooL/go-goon"
	"gopkg.in/pipe.v2"

	"code.google.com/p/go.net/html"
	"code.google.com/p/go.net/html/atom"
)

func write(w io.Writer) {
	file, err := os.Open("./index_go.html")
	if err != nil {
		panic(err)
	}
	defer file.Close()

	foo(file).WriteTo(w)
}

func main() {
	//return
	//write(os.Stdout)

	http.Handle("/index.html", http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		write(w)
	}))
	panic(http.ListenAndServe(":8080", nil))
}

func foo(r io.Reader) *bytes.Buffer {
	var buff bytes.Buffer
	tokenizer := html.NewTokenizer(r)

	depth := 0

	for {
		if tokenizer.Next() == html.ErrorToken {
			err := tokenizer.Err()
			if err == io.EOF {
				return &buff
			}

			return &bytes.Buffer{}
		}

		token := tokenizer.Token()
		switch token.Type {
		case html.DoctypeToken:
			buff.WriteString(token.String())
		case html.CommentToken:
			buff.WriteString(token.String())
		case html.StartTagToken:
			if token.DataAtom == atom.Script {
				depth++
				goon.Dump(token.Attr)
				buff.WriteString(`<script type="text/javascript">`)
			} else {
				buff.WriteString(token.String())
			}
		case html.EndTagToken:
			if token.DataAtom == atom.Script {
				depth--
			}
			buff.WriteString(token.String())
		case html.SelfClosingTagToken:
			buff.WriteString(token.String())
		case html.TextToken:
			if depth > 0 {
				buff.WriteString(goToJs(token.Data))
			} else {
				buff.WriteString(token.Data)
			}
		default:
			return &bytes.Buffer{}
		}
	}
}

func goToJs(goCode string) (jsCode string) {
	started := time.Now()
	defer func() { fmt.Println("goToJs taken:", time.Since(started)) }()

	// TODO: Don't shell out, and avoid having to write/read temporary files, instead
	//       use http://godoc.org/github.com/gopherjs/gopherjs/compiler directly, etc.
	p := pipe.Script(
		pipe.Line(
			pipe.Print(goCode),
			pipe.WriteFile("tmp.go", 0666),
		),
		pipe.Exec("gopherjs", "build", "tmp.go"),
		pipe.ReadFile("tmp.js"),
	)

	out, err := pipe.Output(p)
	if err != nil {
		goon.Dump(string(out), err)
	}

	return string(out)
}
