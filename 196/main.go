// Learn about ways to make Chrome display spinner for the current page (in a controlled manner).
package main

import (
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"time"
)

func main() {
	http.HandleFunc("/waithtml", func(w http.ResponseWriter, req *http.Request) {
		time.Sleep(5 * time.Second)
		fmt.Fprintln(w,
			`<html>
				<head></head>
				<body>wait html</body>
			</html>`)
	})
	http.HandleFunc("/waitimage", func(w http.ResponseWriter, req *http.Request) {
		fmt.Fprintln(w,
			`<html>
				<head></head>
				<body><img src="image"></body>
			</html>`)
	})
	http.HandleFunc("/image", func(w http.ResponseWriter, req *http.Request) {
		time.Sleep(5 * time.Second)
		http.ServeFile(w, req, filepath.FromSlash("../187/player/random/gopher-2.png"))
	})

	log.Fatalln(http.ListenAndServe("localhost:8080", nil))
}
