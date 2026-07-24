import React from "react";

export function MarkdownRenderer({ content }: { content: string }) {
  const parseMarkdown = (text: string) => {
    let html = text
      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-bold text-gray-900 mt-4 mb-2">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold text-gray-900 mt-5 mb-3">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-black text-gray-900 mt-6 mb-4">$1</h1>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/!\[(.*?)\]\((.*?)\)/gim, "<img alt='$1' src='$2' />")
      .replace(/\[(.*?)\]\((.*?)\)/gim, "<a href='$2' class='text-blue-600 hover:underline'>$1</a>")
      .replace(/\n$/gim, '<br />');

    // Handle lists
    html = html.replace(/^\s*-\s+(.*)/gim, '<li class="ml-4 list-disc text-gray-700 mb-1">$1</li>');
    html = html.replace(/^\s*\*\s+(.*)/gim, '<li class="ml-4 list-disc text-gray-700 mb-1">$1</li>');
    
    // Group lists
    html = html.replace(/(<li.*?>.*?<\/li>)(?!<li)/gim, '$1</ul>');
    html = html.replace(/(?!<\/ul>)<li/gim, '<ul class="mb-4"><li');

    // Paragraphs
    html = html.replace(/^(?!<h|<ul|<li|<br)(.*$)/gim, '<p class="text-gray-700 mb-2 leading-relaxed">$1</p>');

    return html;
  };

  return (
    <div
      className="markdown-body"
      dangerouslySetInnerHTML={{ __html: parseMarkdown(content) }}
    />
  );
}
