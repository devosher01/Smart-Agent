import { Pipe, PipeTransform } from '@angular/core';
import { marked } from 'marked';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({
  name: 'markdown',
  standalone: true,
})
export class MarkdownPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) { }

  transform(value: string): SafeHtml {
    if (!value) return '';
    // Configure marked to NOT treat single newlines as <br> (breaks: false)
    // This often conflicts with backend generation that adds newlines for readability
    marked.use({ breaks: false, gfm: true });
    const html = marked.parse(value);
    return this.sanitizer.bypassSecurityTrustHtml(html as string);
  }
}
