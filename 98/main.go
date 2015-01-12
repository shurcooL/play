package main

import (
	"fmt"
	"log"
	"net/url"
	"os"
	"path/filepath"

	"github.com/shurcooL/go-goon"
	"github.com/shurcooL/go/vfs_util"

	"strings"

	"sourcegraph.com/sourcegraph/vcsstore/vcsclient"
)

func main() {
	sg := vcsclient.New(&url.URL{Scheme: "http", Host: "gotools.org:26203"}, nil)
	sg.UserAgent = "gotools.org backend " + sg.UserAgent

	cloneUrl, err := url.Parse("https://github.com/shurcooL/play")
	if err != nil {
		log.Panicln(err)
	}

	repo, err := sg.Repository("git", cloneUrl)
	if err != nil {
		log.Panicln(err)
	}

	commitId, err := repo.ResolveRevision("371e3d65c2f47031ba88675eeae69f94a81a0ddc")

	goon.DumpExpr(commitId, err)

	fs, err := repo.FileSystem(commitId)
	if err != nil {
		log.Panicln(err)
	}

	{
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

		err = vfs_util.Walk(fs, "./", walkFn)
		if err != nil {
			panic(err)
		}
	}
}
