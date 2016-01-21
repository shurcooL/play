// Learn about printing all addresses that are being served.
package main

import (
	"flag"
	"fmt"
	"log"
	"net"
)

var httpFlag = flag.String("http", ":8080", "Listen for HTTP connections on this address.")

func main() {
	flag.Parse()

	// Print all addresses that are being served.
	var hosts []string
	if len(*httpFlag) >= 1 && (*httpFlag)[0] == ':' { // ":port" form.
		ips, err := allIPs()
		if err != nil {
			log.Fatalln(err)
		}
		for _, ip := range ips {
			// THINK: Is replacing 127.0.0.1 with localhost a good idea? It's what peopel are used to, but maybe it's simpler not to...
			/*if ip == "127.0.0.1" {
				ip = "localhost"
			}*/
			hosts = append(hosts, ip+*httpFlag)
		}
	} else { // "host" or "host:port" form.
		hosts = []string{*httpFlag}
	}
	fmt.Println("serving at:")
	for _, host := range hosts {
		fmt.Printf("http://%s/index.html\n", host)
	}
}

// allIPs returns a string slice of all IPs.
func allIPs() (ips []string, err error) {
	ifts, err := net.Interfaces()
	if err != nil {
		return nil, err
	}
	for _, ift := range ifts {
		addrs, err := ift.Addrs()
		if err != nil {
			return nil, err
		}
		for _, addr := range addrs {
			ipNet, ok := addr.(*net.IPNet)
			if !ok {
				continue
			}
			ip4 := ipNet.IP.To4()
			if ip4 == nil {
				continue
			}
			ips = append(ips, ipNet.IP.String())
		}
	}
	return ips, nil
}
