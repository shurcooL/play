package main

import (
	"fmt"
	"io"
	"log"
	"net/http"

	"github.com/shurcooL/htmlg"
	"github.com/shurcooL/octicons"
	"github.com/shurcooL/play/175/idea3/cd"
	"github.com/shurcooL/play/175/idea3/css"
	"github.com/shurcooL/play/175/idea3/cv"
	"github.com/shurcooL/play/175/svg"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

type openBadge struct{}

func (openBadge) Render() []*html.Node {
	// <span class="open-badge"><span class="octicon octicon-issue-opened"></span> Open</span>
	span := htmlg.SpanClass("open-badge",
		svg.Octicon("issue-opened"),
		htmlg.Text(" Open"),
	)
	return []*html.Node{span}
}

func newClosedEventIcon() eventIcon {
	return eventIcon{octicon: "circle-slash"}
}

type eventIcon struct {
	octicon string
}

func (ei eventIcon) Render() []*html.Node {
	span := htmlg.SpanClass("event-icon",
		svg.Octicon(ei.octicon),
	)
	return []*html.Node{span}
}

type Notifications struct {
	Unread bool
}

func (n Notifications) Render() []*html.Node {
	a := &html.Node{
		Type: html.ElementNode, Data: atom.A.String(),
		Attr: []html.Attribute{
			{Key: atom.Class.String(), Val: "notifications"},
			{Key: atom.Href.String(), Val: ""},
		},
	}
	a.AppendChild(svg.Octicon("bell"))
	if n.Unread {
		a.AppendChild(htmlg.SpanClass("notifications-unread"))
	}
	return []*html.Node{a}
}

func genHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")

	io.WriteString(w, `<!DOCTYPE html><html>
	<head>
		<link rel="stylesheet" href="/gen/style.css">
		<link rel="stylesheet" href="/raw/octicons/octicons.min.css">
	</head>
	<body>`)

	io.WriteString(w, htmlg.Render(openBadge{}.Render()...))

	io.WriteString(w, htmlg.Render(newClosedEventIcon().Render()...))

	io.WriteString(w, htmlg.Render(Notifications{Unread: true}.Render()...))

	io.WriteString(w, "<span>some more stuff</span>")

	io.WriteString(w, `</body></html>`)
}

func genStyleHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "text/css; charset=utf-8")

	/*fmt.Fprintln(w, `body {
	}`)*/

	fmt.Fprintf(w, ".open-badge %s", css.Render(css.DeclarationBlock{
		cd.Display{cv.InlineBlock},
		cd.VerticalAlign{cv.Top},
		cd.FontFamily{cv.SansSerif},
		cd.FontSize{cv.Px(14)},
		cd.BackgroundColor{cv.Hex{0x6cc644}},
		cd.Padding{cv.Px(4), cv.Px(8)},
		cd.LineHeight{cv.Px(16)},
		cd.Color{cv.Hex{0xffffff}},
		cd.Fill{cv.CurrentColor{}}, // THINK: Needed for svg only.
	}))

	fmt.Fprintf(w, ".event-icon %s", css.Render(css.DeclarationBlock{
		cd.Display{cv.InlineBlock},
		cd.VerticalAlign{cv.Top},
		cd.BackgroundColor{cv.Hex{0xbd2c00}},
		cd.Padding{cv.Px(8), cv.Px(8)},
		cd.BorderRadius{cv.Percent(50)},
		cd.Color{cv.Hex{0xffffff}},
		cd.Fill{cv.CurrentColor{}}, // THINK: Needed for svg only.
		cd.LineHeight{cv.Px(0)},    // THINK: Needed for HTML5 only. Is there a better way?
	}))

	fmt.Fprintln(w, `.notifications {
	display: inline-block;
	vertical-align: top;
	position: relative;
}
.notifications:hover {
	color: #4183c4;
	fill: currentColor;
}
.notifications-unread {
	display: inline-block;
	width: 10px;
	height: 10px;
	background-color: #4183c4;
	border: 2px solid white;
	border-radius: 50%;
	position: absolute;
	right: -4px;
	top: -6px;
}`)
}

func main() {
	fmt.Println("Started.")
	http.Handle("/raw/", http.StripPrefix("/raw", http.FileServer(http.Dir("raw"))))
	http.Handle("/raw/octicons/", http.StripPrefix("/raw/octicons", http.FileServer(octicons.Assets)))
	http.HandleFunc("/gen/", genHandler)
	http.HandleFunc("/gen/style.css", genStyleHandler)
	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		log.Fatalln(err)
	}
}
