package main

import (
	"log"
	"net/url"
	"syscall/js"
)

func main() {
	js.Global().Set("Open", js.FuncOf(func(_ js.Value, args []js.Value) interface{} {
		anchor, event := args[0], args[1]
		js.Global().Get("window").Get("history").Call("pushState", nil, nil, anchor.Get("href").String()) // TODO: Preserve query, hash? Maybe Href already contains some of that?
		renderPage(anchor.Get("href").String())
		event.Call("preventDefault")
		return nil
	}))
	js.Global().Get("window").Call("addEventListener", "popstate", js.FuncOf(func(js.Value, []js.Value) interface{} {
		renderPage(js.Global().Get("location").Get("href").String())
		return nil
	}))
	renderPage(js.Global().Get("location").Get("href").String())
	select {}
}

func renderPage(href string) {
	u, err := url.Parse(href)
	if err != nil {
		log.Fatalln(err)
	}
	bodyHTML := renderBodyHTML(u.Path)
	js.Global().Get("document").Get("body").Set("innerHTML", bodyHTML)
}
