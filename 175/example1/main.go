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

func genHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")

	io.WriteString(w, `<html>
	<head>
		<link rel="stylesheet" href="/gen/style.css">
		<link rel="stylesheet" href="/raw/octicons/octicons.min.css">
	</head>
	<body>
		`)

	io.WriteString(w, string(htmlg.Render(openBadge{}.Render()...)))

	io.WriteString(w, string(htmlg.Render(newClosedEventIcon().Render()...)))

	io.WriteString(w, `
	</body>
</html>
`)
}

func genStyleHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "text/css; charset=utf-8")

	fmt.Fprintf(w, ".open-badge %s", css.Render(css.DeclarationBlock{
		cd.FontFamily{cv.SansSerif},
		cd.FontSize{cv.Px(14)},
		cd.BackgroundColor{cv.Hex{0x6cc644}},
		cd.Display{cv.InlineBlock},
		cd.Padding{cv.Px(4), cv.Px(8)},
		cd.LineHeight{cv.Px(16)},
		cd.Color{cv.Hex{0xffffff}},
		cd.Fill{cv.CurrentColor{}}, // THINK: Needed for svg only.
	}))

	fmt.Fprintf(w, ".event-icon %s", css.Render(css.DeclarationBlock{
		cd.BackgroundColor{cv.Hex{0xbd2c00}},
		cd.Display{cv.InlineBlock},
		cd.Padding{cv.Px(8), cv.Px(8)},
		cd.BorderRadius{cv.Percent(50)},
		cd.Color{cv.Hex{0xffffff}},
		cd.Fill{cv.CurrentColor{}}, // THINK: Needed for svg only.
		cd.VerticalAlign{cv.Top},
	}))
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
