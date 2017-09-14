// Play with git server over SSH protocol.
package main

import (
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"

	"github.com/shurcooL/play/231/sshgit"
	"golang.org/x/crypto/ssh"
)

var (
	keyFlag = flag.String("key", "gopkgtest_rsa", "Path to private key file to use. (Required.)")
)

func main() {
	flag.Parse()
	if *keyFlag == "" {
		flag.Usage()
		os.Exit(2)
	}

	err := run(*keyFlag)
	if err != nil {
		log.Fatalln(err)
	}
}

func run(keyFile string) error {
	privateBytes, err := ioutil.ReadFile(keyFile)
	if err != nil {
		return fmt.Errorf("failed to load private key: %v", err)
	}
	private, err := ssh.ParsePrivateKey(privateBytes)
	if err != nil {
		return fmt.Errorf("failed to parse private key: %v", err)
	}

	const addr = ":2022"
	fmt.Printf("listening on %q\n", addr)
	//server := sshgit.New(private, "/Users/Dmitri/Desktop/trygit")
	server := sshgit.New(private, filepath.Join(os.Getenv("HOME"), "Dropbox", "Store", "repositories"))
	return server.ListenAndServe(addr)
}
