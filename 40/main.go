// Test GitHub Flavored Markdown rendered locally using go gettable native Go code.
package main

import (
	"net/http"

	"github.com/shurcooL/go/gfmutil"
)

var markdown = []byte(`### GitHub Flavored Markdown rendered locally using go gettable native Go code

` + "```Go" + `
package main

import "fmt"

func main() {
	// This is a comment!
	/* so is this */
	fmt.Println("Hello, playground", 123, 1.336)
}
` + "```" + `

` + "```diff" + `
diff --git a/main.go b/main.go
index dc83bf7..5260a7d 100644
--- a/main.go
+++ b/main.go
@@ -1323,10 +1323,10 @@ func (this *GoPackageSelecterAdapter) GetSelectedGoPackage() *GoPackage {
 }
 
 // TODO: Move to the right place.
-var goPackages = &exp14.GoPackages{SkipGoroot: false}
+var goPackages = &exp14.GoPackages{SkipGoroot: true}
 
 func NewGoPackageListingWidget(pos, size mathgl.Vec2d) *SearchableListWidget {
 	goPackagesSliceStringer := &goPackagesSliceStringer{goPackages}
` + "```" + `
`)

func main() {
	http.HandleFunc("/remote", func(w http.ResponseWriter, req *http.Request) {
		gfmutil.WriteGitHubFlavoredMarkdownViaGitHub(w, markdown)
	})
	http.HandleFunc("/local", func(w http.ResponseWriter, req *http.Request) {
		gfmutil.WriteGitHubFlavoredMarkdownViaLocal(w, markdown)
	})
	http.ListenAndServe(":8080", nil)
}
