// Walk the given filesystem path, search for filenames containing "conflicted".
package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	visited := 0

	root := filepath.Join(os.Getenv("HOME"), "Dropbox")
	err := filepath.Walk(root, func(path string, fi os.FileInfo, err error) error {
		if err != nil {
			log.Printf("can't stat file %s: %v\n", path, err)
			return nil
		}
		visited++
		/*if fi.IsDir() && strings.HasPrefix(fi.Name(), ".") {
			return filepath.SkipDir
		}*/
		if strings.Contains(fi.Name(), "conflicted") {
			fmt.Println(path)
		}
		return nil
	})
	if err != nil {
		log.Fatalln(err)
	}

	fmt.Println("files visited:", visited)
}
