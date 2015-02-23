package main

import (
	"bytes"
	"log"
	"text/template"

	"github.com/gopherjs/gopherjs/js"
)

var t = template.Must(template.New("").Funcs(template.FuncMap{}).Parse(`Dear {{.Name}},
{{if .Attended}}
It was a pleasure to see you at the wedding.{{else}}
It is a shame you couldn't make it to the wedding.{{end}}
{{with .Gift}}Thank you for the lovely {{.}}.
{{end}}
Best wishes,
Josie`))

func main() {
	type Recipient struct {
		Name, Gift string
		Attended   bool
	}
	var recipient = Recipient{
		Name: "Aunt Mildred",
		Gift: "bone china tea set", Attended: true,
	}

	var buf bytes.Buffer
	err := t.Execute(&buf, recipient)
	if err != nil {
		log.Println("executing template:", err)
	}

	js.Global.Get("document").Call("getElementById", "output").Set("textContent", buf.String())
}
