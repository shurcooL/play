// +build js

package main

import (
	"html/template"
	"math/rand"
	"net/url"
	"strings"
	"time"

	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"

	"github.com/gopherjs/gopherjs/js"
	"github.com/shurcooL/go/gopherjs_http/jsutil"
	"github.com/shurcooL/htmlg"

	"honnef.co/go/js/dom"
)

var document = dom.GetWindow().Document().(dom.HTMLDocument)

func main() {}

func init() {
	rand.Seed(time.Now().UnixNano())

	js.Global.Set("SwitchTab", jsutil.Wrap(SwitchTab))

	/*document.AddEventListener("DOMContentLoaded", false, func(_ dom.Event) {
		SwitchTab(nil, nil)
	})*/
}

//func SwitchTab(event dom.Event, anchor *dom.HTMLAnchorElement) {
func SwitchTab(event dom.Event, element dom.HTMLElement) {
	event.PreventDefault()

	rawQuery := strings.TrimPrefix(element.(*dom.HTMLAnchorElement).Search, "?")
	query, _ := url.ParseQuery(rawQuery)

	document.GetElementByID("nav").SetInnerHTML(string(tabs(query)))

	// TODO: dom.GetWindow().History().PushState(...)
	// TODO: Use existing dom.GetWindow().Location().Search, just change "tab" query.
	// #TODO: If query.Encode() is blank, don't include "?" prefix. Hmm, apparently I might not be able to do it here because History.PushState interprets that as doing nothing... Or maybe if I specifully absolute path.
	// TODO: Verify the "." thing works in general case, e.g., for files, different subfolders, etc.
	js.Global.Get("window").Get("history").Call("pushState", nil, nil, "."+fullQuery(query.Encode())+dom.GetWindow().Location().Hash)

	//var selectedTab = query.Get("tab")
	//fmt.Println(selectedTab)

	/*name := "index"
	if event != nil && element != nil {
		event.PreventDefault()
		name = element.(*dom.HTMLAnchorElement).Pathname[1:]
	}

	go open(name)*/
}

// fullQuery returns rawQuery with a "?" prefix if rawQuery is non-empty.
func fullQuery(rawQuery string) string {
	if rawQuery == "" {
		return ""
	}
	return "?" + rawQuery
}

func tabs(query url.Values) template.HTML {
	//return `<a class="active" onclick="Open(event, this);">Tab 1</a><a>Tab 2</a><a>Tab 3</a>`

	var selectedTab = query.Get("tab")

	var ns []*html.Node

	for _, tab := range []struct {
		id   string
		name string
	}{{"", "Tab 1"}, {"2", "Tab 2"}, {"3", "Tab 3"}} {
		a := &html.Node{Type: html.ElementNode, Data: atom.A.String()}
		if tab.id == selectedTab {
			a.Attr = []html.Attribute{{Key: "class", Val: "active"}}
		} else {
			u := url.URL{Path: "/"}
			if tab.id != "" {
				u.RawQuery = url.Values{"tab": {tab.id}}.Encode()
			}
			a.Attr = []html.Attribute{{Key: atom.Href.String(), Val: u.String()}}
		}
		a.Attr = append(a.Attr, html.Attribute{Key: "onclick", Val: "SwitchTab(event, this);"})
		a.AppendChild(htmlg.Text(tab.name))
		ns = append(ns, a)
	}

	tabs, err := htmlg.RenderNodes(ns...)
	if err != nil {
		panic(err)
	}
	return tabs
}

/*
//func Open(event dom.Event, anchor *dom.HTMLAnchorElement) {
func Open(event dom.Event, element dom.HTMLElement) {
	name := "index"
	if event != nil && element != nil {
		event.PreventDefault()
		name = element.(*dom.HTMLAnchorElement).Pathname[1:]
	}

	go open(name)
}

func open(name string) {
	started := time.Now()
	defer func() { fmt.Println("open:", time.Since(started).Seconds()*1000, "ms") }()

	randomString := func() string {
		h := sha1.New()
		binary.Write(h, binary.LittleEndian, time.Now().UnixNano())
		sum := h.Sum(nil)
		return base64.URLEncoding.EncodeToString(sum)[:4+rand.Intn(17)]
	}

	var data = struct {
		Packages   [10]string // Index 0 is the top (most recently viewed Go package).
		Production bool
	}{
		Packages:   [10]string{"package 1", "package 2", "package 3", 5: randomString(), 9: "package 10"},
		Production: false,
	}

	var buf bytes.Buffer
	err := t.ExecuteTemplate(&buf, name, data)
	if err != nil {
		log.Printf("executing template %q: %v\n", name, err)
	}

	document.Body().SetInnerHTML(buf.String())
}
*/
