// +build js

package main

import (
	"bytes"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"html/template"
	"log"
	"math/rand"
	"net/url"
	"strings"
	"time"

	"github.com/gopherjs/gopherjs/js"
	"github.com/shurcooL/go/gopherjs_http/jsutil"
	"github.com/shurcooL/play/148/pages"
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
	// If it's not a left click, defer to default event handling.
	if me, ok := event.(*dom.MouseEvent); ok && me.Button != 0 {
		return
	}

	event.PreventDefault()

	rawQuery := strings.TrimPrefix(element.(*dom.HTMLAnchorElement).Search, "?")
	query, _ := url.ParseQuery(rawQuery)

	document.GetElementByID("tabs").SetInnerHTML(string(pages.Tabs(query)))

	// TODO: dom.GetWindow().History().PushState(...)
	// TODO: Use existing dom.GetWindow().Location().Search, just change "tab" query.
	// #TODO: If query.Encode() is blank, don't include "?" prefix. Hmm, apparently I might not be able to do it here because History.PushState interprets that as doing nothing... Or maybe if I specifully absolute path.
	// TODO: Verify the "." thing works in general case, e.g., for files, different subfolders, etc.
	js.Global.Get("window").Get("history").Call("pushState", nil, nil, "."+fullQuery(query.Encode())+dom.GetWindow().Location().Hash)

	go switchTab("tab" + query.Get("tab"))

	/*name := "index"
	if event != nil && element != nil {
		event.PreventDefault()
		name = element.(*dom.HTMLAnchorElement).Pathname[1:]
	}

	go open(name)*/
}

var tabs = make(map[string]dom.Node) // Tab id -> existing Node.

// fullQuery returns rawQuery with a "?" prefix if rawQuery is non-empty.
func fullQuery(rawQuery string) string {
	if rawQuery == "" {
		return ""
	}
	return "?" + rawQuery
}

/*//func Open(event dom.Event, anchor *dom.HTMLAnchorElement) {
func Open(event dom.Event, element dom.HTMLElement) {
	name := "index"
	if event != nil && element != nil {
		event.PreventDefault()
		name = element.(*dom.HTMLAnchorElement).Pathname[1:]
	}

	go open(name)
}*/

var previousTab = "tab" // HACK.

func switchTab(name string) {
	started := time.Now()
	defer func() { fmt.Println("switchTab:", len(tabs), "tabs,", time.Since(started).Seconds()*1000, "ms") }()

	oldTab := document.GetElementByID(previousTab)

	if tab, ok := tabs[name]; ok {
		oldTab.(dom.HTMLElement).Style().SetProperty("display", "none", "")
		tab.(dom.HTMLElement).Style().SetProperty("display", "initial", "")
		previousTab = name
		return
	}

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

	// <div id="tab">{{template "tab"}}</div>
	newTab := document.CreateElement("div")
	newTab.SetID(name)
	newTab.SetInnerHTML(buf.String())
	tabs[name] = newTab

	oldTab.ParentNode().InsertBefore(newTab, oldTab)
	oldTab.(dom.HTMLElement).Style().SetProperty("display", "none", "")
	previousTab = name
}

var t = template.Must(template.New("").Funcs(template.FuncMap{}).Parse(`{{define "tab"}}
<p>Stuff that happens to be on tab 1.</p>

<ul>
	<li>First thing</li>
	<li>Second thing</li>
	<li>Third thing</li>
</ul>

<div>Your Go Package: <input placeholder="import/path"></input></div>
{{end}}

{{define "tab2"}}
Stuff that happens to be on tab 2.
{{end}}

{{define "tab3"}}
Stuff that happens to be on tab 3.
{{end}}
`))
