// +build js

package main

import (
	"io/ioutil"
	"net/http"

	"github.com/shurcooL/go/u/u9"

	"honnef.co/go/js/dom"
)

var document = dom.GetWindow().Document()

var input = document.GetElementByID("input").(*dom.HTMLTextAreaElement)
var output = document.GetElementByID("output").(dom.HTMLElement)

func run(event dom.Event) {
	go func() {
		output.SetTextContent(Process(input.Value))
	}()
}

func Process(in string) string {
	resp, err := http.Get("http://localhost:8081/" + in)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		panic(err)
	}
	return string(body)
}

func main() {
	document.GetElementByID("run").AddEventListener("click", false, run)
	input.Value = "initial"

	u9.AddTabSupport(input)
}
