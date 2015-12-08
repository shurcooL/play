package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	err := foo()
	if err != nil {
		log.Println(err)
	}
}

func foo() error {
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
		if strings.HasSuffix(path, "/tracker/threads") {
			repoURI := strings.TrimPrefix(path, "/Users/Dmitri/Local/Workspace/appdata/repo/")
			repoURI = strings.TrimSuffix(repoURI, "/tracker/threads")
			fmt.Println(repoURI)
		}
		return nil
	}

	err := filepath.Walk("/Users/Dmitri/Local/Workspace/appdata/repo", walkFn)
	if err != nil {
		return err
	}

	return nil
}
