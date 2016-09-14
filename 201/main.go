// Try gopkg.in/gcfg.v1.
package main

import (
	"fmt"

	"github.com/shurcooL/go-goon"
	"gopkg.in/gcfg.v1"
)

func main() {
	var gitRepoFile struct {
		Subrepo struct {
			Remote string
			Commit string
		}
	}
	err := gcfg.ReadFileInto(&gitRepoFile, "/Users/Dmitri/Dropbox/Needs Processing/shurcool-subrepo/vendor/github.com/golang/glog/.gitrepo")
	if err != nil {
		fmt.Println(err)
	}
	goon.DumpExpr(gitRepoFile)
}
