package main

import (
	"fmt"

	"github.com/shurcooL/play/151/c/htmlg"
)

func main() {
	html := htmlg.Render(
		htmlg.Text("Hi & how are you, "),
		htmlg.A("Gophers", "https://golang.org/"),
		htmlg.Text("? <script> is a cool gopher."),
	)

	fmt.Println(html2)
}
