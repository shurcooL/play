// Play with live html/template editor.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"html/template"

	"github.com/shurcooL/frontend/tabsupport"
	"honnef.co/go/js/dom"
)

var document = dom.GetWindow().Document().(dom.HTMLDocument)

var input = document.GetElementByID("input").(*dom.HTMLTextAreaElement)
var input2 = document.GetElementByID("input2").(*dom.HTMLTextAreaElement)
var outputIframe = document.GetElementByID("outputIframe").(*dom.HTMLIFrameElement)
var output = outputIframe.ContentDocument().Underlying() //.Get("body")

func main() {}

func init() {
	document.AddEventListener("DOMContentLoaded", false, func(_ dom.Event) {
		setup()
	})
}

func run(_ dom.Event) {
	//output.SetInnerHTML(input.Value)
	//output.Set("innerHTML", input.Value)

	go func() {
		t, err := template.New("").Parse(input.Value)
		if err != nil {
			output.Set("innerHTML", "<pre>"+html.EscapeString(fmt.Sprintln("template.Parse:", err))+"</pre>")
			return
		}

		var data interface{}
		err = json.Unmarshal([]byte(input2.Value), &data)
		if err != nil {
			output.Set("innerHTML", "<pre>"+html.EscapeString(fmt.Sprintln("json.Unmarshal:", err))+"</pre>")
			return
		}

		var buf bytes.Buffer
		err = t.Execute(&buf, data)
		if err != nil {
			output.Set("innerHTML", "<pre>"+html.EscapeString(fmt.Sprintln("template.Execute:", err))+"</pre>")
			return
		}

		output.Call("open")
		output.Call("write", buf.String())
		output.Call("close")
	}()
}

func setup() {
	input.AddEventListener("input", false, run)
	input2.AddEventListener("input", false, run)

	input.Value = initial
	input2.Value = initial2

	run(nil)

	tabsupport.Add(input)
	tabsupport.Add(input2)
}

const initial = `{{define "GA"}}{{end}}

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

<html>
	<head>
		<title>{{.ImportPath}} - Go Code</title>
		<link href="http://gotools.org/assets/style.css" rel="stylesheet" type="text/css" />
		<link href="/command-r.css" media="all" rel="stylesheet" type="text/css" />
		<link href="/table-of-contents.css" media="all" rel="stylesheet" type="text/css" />
		{{if .Production}}{{template "GA"}}{{end}}
		<!--script type="text/javascript" src="/script.go.js"></script-->
		<link rel="stylesheet" href="//cdnjs.cloudflare.com/ajax/libs/octicons/2.2.0/octicons.css">
	</head>
	<body>
		<div style="position: relative; min-height: 100%;">
			{{template "header"}}
			<div style="padding-bottom: 50px;">
				<div style="padding: 30px;">
					<h1>{{.ImportPathElements}}</h1>
					{{with .Branches}}<span class="spacing" title="Branch"><span class="octicon octicon-git-branch" style="margin-right: 8px;"></span>{{.}}</span>{{end}}
					<span class="spacing" title="Display Test Files"><label>{{.Tests}}Tests</label></span>
					{{if .Folders}}
						<ul>{{range .Folders}}<li><a href="/{{$.ImportPath}}/{{.}}">{{.}}</a></li>{{end}}</ul>
					{{end}}
					{{if .Bpkg}}
						{{/*<h1>{{if .Bpkg.IsCommand}}Command{{else}}Package{{end}} {{.Bpkg.Name}}</h1>*/}}
						{{.Files}}
					{{end}}
				</div>
			</div>
			{{template "footer"}}
		</div>
	</body>
</html>
`

const initial2 = `{
	"ImportPathElements": "stuff",
	"Bpkg": {
		"Name": "Some"
	},
	"Files": "<pre>more stuff why</pre>"
}`
