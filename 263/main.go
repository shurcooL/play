// Play with fetching repo root for import path
// using stripped down copies of latest cmd/go/internal packages
// (instead of via golang.org/x/tools/go/vcs package).
package main

import (
	"log"

	"github.com/davecgh/go-spew/spew"
	"github.com/shurcooL/play/263/get"
	"github.com/shurcooL/play/263/web"
)

func main() {
	err := run()
	if err != nil {
		log.Fatalln(err)
	}
}

func run() error {
	rr, err := get.RepoRootForImportPath("dmitri.shuralyov.com/gpu/mtl/cmd/mtlinfo", get.PreferMod, web.SecureOnly)
	if err != nil {
		return err
	}
	spew.Dump(rr)
	return nil
}
