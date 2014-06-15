package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	//root := "/Users/Dmitri/Dropbox/Work/2013/GoLand/src/github.com/shurcooL/play/"
	root := "/Users/Dmitri/Dropbox/"
	err := filepath.Walk(root, func(path string, fi os.FileInfo, _ error) error {
		/*if fi.IsDir() && strings.HasPrefix(fi.Name(), ".") {
			return filepath.SkipDir
		}*/
		if strings.Contains(fi.Name(), "conflicted") {
			fmt.Println(path)
		}
		return nil
	})
	if err != nil {
		panic(err)
	}
}
