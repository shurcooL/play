package main

import (
	"fmt"
	"io"
	"log"
	"net/http"

	"github.com/shurcooL/htmlg"
	"github.com/shurcooL/play/175/idea2/css"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

func openBadge() []*html.Node {
	n := &html.Node{
		Type: html.ElementNode, Data: atom.Span.String(),
		Attr: []html.Attribute{
			{Key: atom.Class.String(), Val: "open-badge"},
		},
	}
	n.AppendChild(
		&html.Node{
			Type: html.ElementNode, Data: atom.Span.String(),
			Attr: []html.Attribute{
				{Key: atom.Class.String(), Val: "octicon octicon-issue-opened"},
			},
		},
	)
	n.AppendChild(&html.Node{
		Type: html.TextNode, Data: " Open",
	})
	return []*html.Node{n}
}

func genHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")

	io.WriteString(w, `<html>
	<head>
		<link rel="stylesheet" href="/gen/style.css">
		<link rel="stylesheet" href="/raw/octicons/octicons.css">
	</head>
	<body>
		`)

	openBadge := openBadge()
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
	n := struct {
		css.BackgroundColor
		css.FontSize
		css.LineHeight
	}{
		//FontFamily: "sans-serif";
		FontSize:        css.FontSize{css.Px(14)},
		BackgroundColor: css.BackgroundColor{css.Hex{0x6cc644}},
		//Display: css.InlineBlock,
		//Padding: 4px 8px;
		LineHeight: css.LineHeight{css.Px(20)},
		//Color: css.Color{css.Hex{0xffffff}},
	}
	fmt.Fprintf(w, ".open-badge %s", css.Render(n))
}

func main() {
	fmt.Println("Started.")
	http.Handle("/raw/", http.StripPrefix("/raw/", http.FileServer(http.Dir("raw"))))
	http.HandleFunc("/gen/", genHandler)
	http.HandleFunc("/gen/style.css", genStyleHandler)
	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		log.Fatalln(err)
	}
}
