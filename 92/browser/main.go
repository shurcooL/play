package main

import (
	"flag"
	"fmt"
	"io"
	"net/http"

	"github.com/shurcooL/go/gopherjs_http"
)

var httpFlag = flag.String("http", "localhost:8080", "Listen for HTTP connections on this address.")

func main() {
	flag.Parse()

	// ---

	http.HandleFunc("/index.html", func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		io.WriteString(w, `<html>
	<head>
		<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
	</head>
	<body>
		<script src="/script.go.js" type="text/javascript"></script>
	</body>
</html>
`)
	})
	http.Handle("/script.go.js", gopherjs_http.GoFiles("./browser/script.go")) // TODO: This is a relative path, any way to improve?

	// ---

	// Open a browser tab and navigate to index page.
	//u4.Open("http://" + *httpFlag + "/index.html")

	fmt.Println("App is served at http://" + *httpFlag + "/index.html.")

	err := http.ListenAndServe(*httpFlag, nil)
	if err != nil {
		panic(err)
	}
}
