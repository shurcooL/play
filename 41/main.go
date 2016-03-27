package main

import (
	"fmt"
	"net/http"
	"time"

	"github.com/shurcooL/go/gfmutil"
)

func main() {
	markdown := []byte(`### github.com/shurcooL/go/...

` + "```" + `
 M github_flavored_markdown/main.go
 M u/u7/main.go
` + "```" + `

` + "```" + `diff
diff --git a/github_flavored_markdown/main.go b/github_flavored_markdown/main.go
index 6672589..2f8432f 100644
--- a/github_flavored_markdown/main.go
+++ b/github_flavored_markdown/main.go
@@ -131,7 +131,7 @@ func (_ *renderer) BlockCode(out *bytes.Buffer, text []byte, lang string) {
 	}
 }
 
-var gfmHTMLConfig = syntaxhighlight.HTMLConfig{
+var gfmHtmlConfig = syntaxhighlight.HTMLConfig{
 	String:        "s",
 	Keyword:       "k",
 	Comment:       "c",
@@ -152,7 +152,7 @@ func formatCode(src []byte, lang string) (formattedCode []byte, ok bool) {
 	// TODO: Use a highlighter based on go/scanner for Go code.
 	case "Go", "go":
 		var buf bytes.Buffer
-		err := syntaxhighlight.Print(syntaxhighlight.NewScanner(src), &buf, syntaxhighlight.HTMLPrinter(gfmHTMLConfig))
+		err := syntaxhighlight.Print(syntaxhighlight.NewScanner(src), &buf, syntaxhighlight.HTMLPrinter(gfmHtmlConfig))
 		if err != nil {
 			return nil, false
 		}
diff --git a/u/u7/main.go b/u/u7/main.go
index 68ea505..9bbe53e 100644
--- a/u/u7/main.go
+++ b/u/u7/main.go
@@ -85,9 +85,7 @@ func (s *Scanner) Scan() bool {
 func (s *Scanner) Token() ([]byte, int) {
 	var kind int
 	switch {
-	case len(s.line) == 0 ||
-		s.line[0] == ' ':
-
+	case len(s.line) == 0 || s.line[0] == ' ':
 		kind = 0
 	case s.line[0] == '+':
 		kind = 1
` + "```" + `
`)

	_ = http.ListenAndServe(":8080", http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if _, plain := req.URL.Query()["plain"]; plain {
			w.Header().Set("Content-Type", "text/plain")
			w.Write(markdown)
		} else if _, github := req.URL.Query()["github"]; github {
			w.Header().Set("Content-Type", "text/html")
			started := time.Now()
			gfmutil.WriteGitHubFlavoredMarkdownViaGitHub(w, markdown)
			fmt.Println("rendered GFM via GitHub, took", time.Since(started))
		} else {
			w.Header().Set("Content-Type", "text/html")
			started := time.Now()
			gfmutil.WriteGitHubFlavoredMarkdownViaLocal(w, markdown)
			fmt.Println("rendered GFM locally, took", time.Since(started))
		}
	}))
}
