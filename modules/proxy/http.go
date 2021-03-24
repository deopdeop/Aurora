package proxy

import (
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/titaniumnetwork-dev/Aurora/modules/config"
	"github.com/titaniumnetwork-dev/Aurora/modules/rewrites"
)

// Server used for http proxy
// TODO: Encode queries in base64 both the key and value same with fragment
func HTTPServer(w http.ResponseWriter, r *http.Request) {
	var err error

	for _, userAgent := range config.YAML.BlockedUserAgents {
		if userAgent == r.UserAgent() {
			w.WriteHeader(http.StatusUnauthorized)
			fmt.Fprintf(w, "401, not authorized")
			return
		}
	}

	var scheme string
	if r.TLS == nil {
		scheme = "http"
	} else if r.TLS != nil {
		scheme = "https"
	}

	query := ""
	i := 0
	for key, val := range r.URL.Query() {
		valStr := strings.Join(strings.Split(strings.Join(val, ""), " "), "+")

		// TODO: Replace whitespace with +
		if i == 0 {
			query += fmt.Sprintf("?%s=%s", key, valStr)
		} else {
			query += fmt.Sprintf("&%s=%s", key, valStr)
		}

		i++
	}

	config.URL, err = url.Parse(fmt.Sprintf("%s://%s%s%s", scheme, r.Host, r.RequestURI, query))
	if err != nil || config.URL.Scheme == "" || config.URL.Host == "" {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprintf(w, "500, %s", fmt.Sprintf("Unable to parse url, %s", fmt.Sprintf("%s://%s%s", scheme, r.Host, r.RequestURI)))
		return
	}

	proxyURLBytes, err := base64.URLEncoding.DecodeString(config.URL.Path[len(config.YAML.HTTPPrefix):])
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprintf(w, "500, %s", err)
		return
	}

	config.ProxyURL, err = url.Parse(string(proxyURLBytes) + query + r.URL.Fragment)
	if err != nil || config.ProxyURL.Scheme == "" || config.ProxyURL.Host == "" {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprintf(w, fmt.Sprintf("500, %s", fmt.Sprintf("Unable to parse url, %s", string(proxyURLBytes))))
		return
	}

	for _, domain := range config.YAML.BlockedDomains {
		if domain == config.ProxyURL.Hostname() {
			w.WriteHeader(http.StatusUnauthorized)
			fmt.Fprintf(w, fmt.Sprintf("401, %s has been blocked", config.ProxyURL.Hostname()))
			return
		}
	}

	tr := &http.Transport{
		IdleConnTimeout: 10 * time.Second,
	}

	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
		Transport: tr,
	}

	req, err := http.NewRequest("GET", config.ProxyURL.String(), nil)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		fmt.Fprintf(w, "404, %s", err)
		return
	}

	for _, header := range config.YAML.BlockedHeaders {
		delete(r.Header, header)
	}
	for key, val := range r.Header {
		val = rewrites.Header(key, val)
		req.Header.Set(key, strings.Join(val, ", "))
	}

	resp, err := client.Do(req)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		fmt.Fprintf(w, "404, %s", err)
		return
	}
	defer resp.Body.Close()

	if config.YAML.Cap != 0 {
		http.MaxBytesReader(w, resp.Body, config.YAML.Cap)
	}

	for _, header := range config.YAML.BlockedHeaders {
		delete(resp.Header, header)
	}
	for key, val := range resp.Header {
		val = rewrites.Header(key, val)
		w.Header().Set(key, strings.Join(val, ", "))
	}

	w.WriteHeader(resp.StatusCode)

	// TODO: Support gzip encoding
	contentType := resp.Header.Get("Content-Type")
	switch true {
	case strings.HasPrefix(contentType, "text/html"):
		resp.Body = rewrites.HTML(resp.Body)
	case strings.HasPrefix(contentType, "text/css"):
		respBodyInterface := rewrites.CSS(resp.Body)
		resp.Body = respBodyInterface.(io.ReadCloser)
	case strings.HasPrefix(contentType, "application/javascript") || strings.HasPrefix(contentType, "application/x-javascript") || strings.HasPrefix(contentType, "text/javascript"):
		resp.Body = rewrites.JS(resp.Body)
	case strings.HasPrefix(contentType, "image/svg"):
		// TODO: Rewrite SVG
	case strings.HasPrefix(contentType, "text/json"):
		if strings.HasPrefix(config.ProxyURL.Path, "/manifest.json") {
			// TODO Rewrite
		}
	}
	io.Copy(w, resp.Body)
}
