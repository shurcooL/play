package main

import (
	"fmt"
	"log"
	"net/url"
	"os"
	"path/filepath"

	"github.com/shurcooL/go-goon"
	"github.com/shurcooL/go/vfs/godocfs/vfsutil"

	"strings"

	"sourcegraph.com/sourcegraph/vcsstore/vcsclient"
)

func main() {
	sg := vcsclient.New(&url.URL{Scheme: "http", Host: "localhost:26203"}, nil)
	sg.UserAgent = "gotools.org backend " + sg.UserAgent

	cloneUrl, err := url.Parse("https://github.com/shurcooL/play")
	if err != nil {
		log.Panicln(err)
	}

	repo, err := sg.Repository("git", cloneUrl)
	if err != nil {
		log.Panicln(err)
	}

	//commitId, err := repo.ResolveRevision("371e3d65c2f47031ba88675eeae69f94a81a0ddc")
	commitId, err := repo.ResolveRevision("2874b2ef9be165966e5620fc29b592c041262721")

	goon.DumpExpr(commitId, err)

	fs, err := repo.FileSystem(commitId)
	if err != nil {
		log.Panicln(err)
	}

	if false {
		walkFn := func(path string, fi os.FileInfo, err error) error {
			if err != nil {
				log.Printf("can't stat file %s: %v\n", path, err)
				return nil
			}
			if strings.HasPrefix(fi.Name(), ".") {
				if fi.IsDir() {
					return filepath.SkipDir
				} else {
					return nil
				}
			}
			fmt.Println(path)
			return nil
		}

		err = vfsutil.Walk(fs, "./", walkFn)
		if err != nil {
			panic(err)
		}
	}
}
