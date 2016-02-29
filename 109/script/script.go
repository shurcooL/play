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
	"time"

	"github.com/gopherjs/gopherjs/js"
	"github.com/shurcooL/go/gopherjs_http/jsutil"

	"honnef.co/go/js/dom"
)

var document = dom.GetWindow().Document().(dom.HTMLDocument)

func main() {}

func init() {
	rand.Seed(time.Now().UnixNano())

	js.Global.Set("Open", jsutil.Wrap(Open))

	if document.Body() != nil {
		Open(nil, nil)
	} else {
		document.AddEventListener("DOMContentLoaded", false, func(_ dom.Event) {
			Open(nil, nil)
		})
	}
}

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

	//fmt.Println("ExecuteTemplate:", time.Since(started).Seconds()*1000, "ms")

	document.Body().SetInnerHTML(buf.String())
	//document.Head().SetInnerHTML("<title>Title</title>") // Doing this gets rid of this script.

	//newBody := document.CreateElement("body")
	/*newBody := document.Body().CloneNode(false).(dom.Element)
	newBody.SetInnerHTML(buf.String())
	document.Body().ParentNode().ReplaceChild(newBody, document.Body())*/
	/*newBody := js.Global.Get("document").Call("createElement", "body")
	newBody.Set("innerHTML", buf.String())
	js.Global.Get("document").Call("replaceChild", newBody, js.Global.Get("document").Get("body"))*/

	//fmt.Println("SetInnerHTML:", time.Since(started).Seconds()*1000, "ms")
}

var t = template.Must(template.New("").Funcs(template.FuncMap{}).Parse(`{{define "GA"}}{{end}}

{{define "header"}}
<div class="header" style="width: 100%; background-color: hsl(209, 51%, 92%); font-size: 14px;">
	<span style="margin-left: 30px; padding: 15px; display: inline-block;"><strong><a href="/index" onclick="Open(event, this);">Go Tools</a></strong></span>
	<span style="margin-left: 30px; padding: 15px; display: inline-block;"><a href="/installed" onclick="Open(event, this);">Installed</a></span>
</div>
{{end}}

{{define "footer"}}
<div style="position: absolute; bottom: 0; left: 0; width: 100%; text-align: right; background-color: hsl(209, 51%, 92%);">
	<span style="margin-right: 15px; padding: 15px; display: inline-block;"><a href="https://github.com/shurcooL/gtdo/issues" target="_blank">Report an issue</a></span>
</div>
{{end}}

{{define "index"}}
<div style="position: relative; min-height: 100%;">
	{{template "header"}}
	<div style="padding-bottom: 50px;">
		<article style="padding: 30px;">
			<p>There's one tool. It lets you view the source code of any Go package.</p>
			<span class="import-path-container" style="background-color: #f2f2f2; padding: 20px; display: inline-block;">
				<input id="import-path" placeholder="import/path" autofocus onkeydown="if (event.keyCode != 13) { return; }; window.location = &quot;/&quot; + document.getElementById(&quot;import-path&quot;).value;">
				<button onclick="window.location = &quot;/&quot; + document.getElementById(&quot;import-path&quot;).value;">Go</button>
			</span>
			<h3>Recently Viewed Packages</h3>
			<ul>{{range .Packages}}<li><a href="/{{.}}"><code>{{.}}</code></a></li>{{end}}</ul>
		</article>
	</div>
	{{template "footer"}}
</div>
{{end}}

{{define "installed"}}
<div style="position: relative; min-height: 100%;">
	{{template "header"}}
	<div style="padding-bottom: 50px;">
		<article style="padding: 30px;">
			<p>Installed stuff!</p>
			<p>I wonder if it'll work...</p>
			<p>Okay, this is pretty cool.</p>
		</article>
	</div>
	{{template "footer"}}
</div>
{{end}}
`))
