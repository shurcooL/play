// Play with generating entire body from html/template in frontend.
package main

import (
	"bytes"
	"html/template"
	"log"

	"honnef.co/go/js/dom"
)

var document = dom.GetWindow().Document().(dom.HTMLDocument)

func main() {}

func init() {
	document.AddEventListener("DOMContentLoaded", false, func(_ dom.Event) {
		go setup()
	})
}

func setup() {
	var data = struct {
		Packages   [10]string // Index 0 is the top (most recently viewed Go package).
		Production bool
	}{
		Packages:   [10]string{"package 1", "package 2", "package 3", 9: "package 10"},
		Production: false,
	}

	var buf bytes.Buffer
	err := t.Execute(&buf, data)
	if err != nil {
		log.Println("executing template:", err)
	}

	document.Body().SetInnerHTML(buf.String())
	//document.Head().SetInnerHTML("<title>Title</title>") // Doing this gets rid of this script.
}

var t = template.Must(template.New("").Funcs(template.FuncMap{}).Parse(`{{define "GA"}}{{end}}

{{define "header"}}
<div class="header" style="width: 100%; background-color: hsl(209, 51%, 92%); font-size: 14px;">
	<span style="margin-left: 30px; padding: 15px; display: inline-block;"><strong><a class="black" href="/">Go Tools</a></strong></span>
</div>
{{end}}

{{define "footer"}}
<div style="position: absolute; bottom: 0; left: 0; width: 100%; text-align: right; background-color: hsl(209, 51%, 92%);">
	<span style="margin-right: 15px; padding: 15px; display: inline-block;"><a href="https://github.com/shurcooL/gtdo/issues" target="_blank">Report an issue</a></span>
</div>
{{end}}

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
`))
