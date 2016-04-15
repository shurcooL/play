// +build js

// Play with doing net/http.Get in browser.
package main

import (
	"fmt"
	"io/ioutil"
	"net/http"

	"github.com/shurcooL/frontend/tabsupport"
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
	resp, err := http.Get(in)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()
	//_, err = io.Copy(os.Stdout, resp.Body)
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		panic(err)
	}
	return fmt.Sprintf("got a response with status: %v\n\n%s", resp.Status, string(body))
}

func main() {
	document.GetElementByID("run").AddEventListener("click", false, run)
	input.Value = "https://api.github.com"

	tabsupport.Add(input)
}
