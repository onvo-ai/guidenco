import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { url } = await req.json();

    if (!url || typeof url !== 'string') {
      return Response.json({ error: 'Valid URL is required' }, { status: 400 });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return Response.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    // Fetch the webpage content
    let html: string;
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.status}`);
      }
      
      html = await response.text();
    } catch (error) {
      return Response.json({ 
        error: 'Failed to fetch the website. Please check the URL and try again.' 
      }, { status: 400 });
    }

    // Extract design information from HTML
    const analysis = await analyzeWebsiteDesign(html, url);

    return NextResponse.json({ analysis });
  } catch (error) {
    console.error('Error analyzing website:', error);
    return NextResponse.json({ error: 'Failed to analyze website' }, { status: 500 });
  }
}

async function analyzeWebsiteDesign(html: string, url: string): Promise<string> {
  // Extract CSS from style tags and link tags
  const cssContent = extractCSS(html);
  
  // Extract key design elements
  const colors = extractColors(cssContent, html);
  const fonts = extractFonts(cssContent, html);
  const spacing = extractSpacing(cssContent);
  const layout = extractLayoutInfo(html);
  const components = extractComponentStyles(cssContent);

  // Build comprehensive analysis
  const analysis = `## Website Design Analysis: ${new URL(url).hostname}

### Color Palette
${colors.length > 0 ? colors.map(color => `- ${color}`).join('\n') : '- No specific color palette detected'}

### Typography
${fonts.length > 0 ? fonts.map(font => `- ${font}`).join('\n') : '- No specific fonts detected'}

### Spacing & Layout
${spacing.length > 0 ? spacing.map(item => `- ${item}`).join('\n') : '- Standard spacing detected'}

### Layout Structure
${layout.length > 0 ? layout.map(item => `- ${item}`).join('\n') : '- Standard web layout detected'}

### Component Styles
${components.length > 0 ? components.map(comp => `- ${comp}`).join('\n') : '- Standard component styles detected'}

### Design Patterns
- Modern, clean design aesthetic
- Responsive layout considerations
- User-friendly interface elements
- Consistent visual hierarchy

### Recommendations for Similar Designs
- Use the detected color palette as primary brand colors
- Apply similar typography for consistency
- Follow the spacing patterns for visual harmony
- Implement similar component structure for familiarity`;

  return analysis;
}

function extractCSS(html: string): string {
  // Extract content from style tags
  const styleTags = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
  let css = styleTags.map(tag => tag.replace(/<\/?style[^>]*>/gi, '')).join('\n');
  
  // Extract CSS from link tags (we can't fetch external CSS easily, so we'll note it)
  const linkTags = html.match(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi) || [];
  if (linkTags.length > 0) {
    css += '\n/* External stylesheets detected */';
  }
  
  return css;
}

function extractColors(css: string, html: string): string[] {
  const colors = new Set<string>();
  
  // Extract colors from CSS
  const colorMatches = css.match(/(#[0-9a-fA-F]{3,6}|rgb[a]?\([^)]+\)|hsl[a]?\([^)]+\)|[a-zA-Z]+(?:-[a-zA-Z]+)*)/g) || [];
  colorMatches.forEach(color => {
    if (color.startsWith('#') || color.startsWith('rgb') || color.startsWith('hsl')) {
      colors.add(color);
    }
  });
  
  // Extract colors from inline styles
  const inlineStyles = html.match(/style=["'][^"']*["']/gi) || [];
  inlineStyles.forEach(style => {
    const styleColors = style.match(/(#[0-9a-fA-F]{3,6}|rgb[a]?\([^)]+\))/g) || [];
    styleColors.forEach(color => colors.add(color));
  });
  
  return Array.from(colors).slice(0, 10); // Limit to top 10 colors
}

function extractFonts(css: string, html: string): string[] {
  const fonts = new Set<string>();
  
  // Extract font families from CSS
  const fontMatches = css.match(/font-family:\s*([^;]+)/gi) || [];
  fontMatches.forEach(match => {
    const fontFamily = match.replace(/font-family:\s*/i, '').replace(/['"]/g, '').split(',')[0].trim();
    if (fontFamily && !fontFamily.includes('serif') && !fontFamily.includes('sans-serif')) {
      fonts.add(fontFamily);
    }
  });
  
  // Extract Google Fonts
  const googleFontMatches = html.match(/fonts\.googleapis\.com[^"']*/gi) || [];
  googleFontMatches.forEach(match => {
    const fontFamilies = match.match(/family=([^&]+)/i);
    if (fontFamilies) {
      const fontsList = decodeURIComponent(fontFamilies[1]).split('|');
      fontsList.forEach(font => {
        const fontName = font.split(':')[0].replace(/\+/g, ' ');
        fonts.add(fontName);
      });
    }
  });
  
  return Array.from(fonts).slice(0, 8); // Limit to top 8 fonts
}

function extractSpacing(css: string): string[] {
  const spacing = new Set<string>();
  
  // Extract common spacing values
  const paddingMatches = css.match(/padding:\s*([^;]+)/gi) || [];
  const marginMatches = css.match(/margin:\s*([^;]+)/gi) || [];
  
  [...paddingMatches, ...marginMatches].forEach(match => {
    const value = match.split(':')[1].trim();
    if (value && !value.includes('auto')) {
      spacing.add(`Spacing: ${value}`);
    }
  });
  
  // Extract gap values for flex/grid
  const gapMatches = css.match(/gap:\s*([^;]+)/gi) || [];
  gapMatches.forEach(match => {
    spacing.add(`Gap: ${match.split(':')[1].trim()}`);
  });
  
  return Array.from(spacing).slice(0, 6);
}

function extractLayoutInfo(html: string): string[] {
  const layout = [];
  
  // Check for common layout patterns
  if (html.includes('flex') || html.includes('display:flex')) {
    layout.push('Flexbox layout detected');
  }
  
  if (html.includes('grid') || html.includes('display:grid')) {
    layout.push('CSS Grid layout detected');
  }
  
  // Check for responsive design
  if (html.includes('@media') || html.includes('responsive')) {
    layout.push('Responsive design implemented');
  }
  
  // Check for common layout containers
  if (html.includes('container') || html.includes('wrapper')) {
    layout.push('Container-based layout');
  }
  
  // Check for header/footer structure
  if (html.includes('<header') || html.includes('<nav')) {
    layout.push('Semantic header/navigation structure');
  }
  
  if (html.includes('<footer')) {
    layout.push('Footer section present');
  }
  
  return layout;
}

function extractComponentStyles(css: string): string[] {
  const components = [];
  
  // Look for button styles
  if (css.includes('button') || css.includes('.btn')) {
    components.push('Custom button styles detected');
  }
  
  // Look for card styles
  if (css.includes('card') || css.includes('.card')) {
    components.push('Card-based components detected');
  }
  
  // Look for form styles
  if (css.includes('input') || css.includes('form')) {
    components.push('Custom form styling detected');
  }
  
  // Look for navigation styles
  if (css.includes('nav') || css.includes('.nav')) {
    components.push('Navigation component styling detected');
  }
  
  // Look for animation/transitions
  if (css.includes('transition') || css.includes('animation')) {
    components.push('CSS animations/transitions present');
  }
  
  return components;
}
