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
	"golang.org/x/net/html"
)

type openBadge struct{}

func (openBadge) Render() []*html.Node {
	// <span class="open-badge"><span class="octicon octicon-issue-opened"></span> Open</span>
	span := htmlg.SpanClass("open-badge",
		htmlg.SpanClass("octicon octicon-issue-opened"),
		htmlg.Text(" Open"),
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

	openBadge := openBadge{}.Render()
	io.WriteString(w, string(htmlg.Render(openBadge...)))

	io.WriteString(w, `
	</body>
</html>
`)
}

func genStyleHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "text/css; charset=utf-8")

	/*io.WriteString(w, `.open-badge {
		font-family: sans-serif;
		font-size: 14px;
		background-color: #6cc644;
		display: inline-block;
		padding: 4px 8px;
		line-height: 20px;
		color: #fff;
	}
	`)*/
	n := css.DeclarationBlock{
		cd.FontFamily{cv.SansSerif},
		cd.FontSize{cv.Px(14)},
		cd.BackgroundColor{cv.Hex{0x6cc644}},
		cd.Display{cv.InlineBlock},
		cd.Padding{cv.Px(4), cv.Px(8)},
		cd.LineHeight{cv.Px(20)},
		cd.Color{cv.Hex{0xffffff}},
	}
	fmt.Fprintf(w, ".open-badge %s", css.Render(n))
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
