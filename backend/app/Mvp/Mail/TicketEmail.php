<?php
declare(strict_types=1);

namespace App\Mvp\Mail;

use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;

final class TicketEmail
{
    public static function build(#[\SensitiveParameter] array $payload, #[\SensitiveParameter] array $config, string $attemptId, string $createdAt): Email
    {
        $email = (new Email())->from(new Address($config['senderEmail'], $config['senderName']))->to($payload['recipient'])
            ->date(new \DateTimeImmutable($createdAt));
        if ($config['replyTo'] !== '') $email->replyTo($config['replyTo']);
        $email->getHeaders()->addIdHeader('Message-ID', $attemptId.'@gazaairport.com');
        if ($payload['purpose'] === 'test') {
            return $email->subject('Gaza Gateway email configuration test')
                ->text("Gaza International Airport\nThis is a requested email configuration test.\n")
                ->html('<html lang="en"><body style="background:#eee7d8;color:#25352b;font-family:Arial,sans-serif;padding:32px"><h1>Gaza International Airport</h1><p>This is a requested email configuration test.</p></body></html>');
        }
        $ticket = $payload['ticket'];
        $escape = static fn(string $s): string => htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $html = ''; $text = '';
        foreach (['en', 'ar'] as $lang) {
            $ar = $lang === 'ar';
            $heading = $ar ? 'مطار غزة الدولي' : 'Gaza International Airport';
            $title = $ar ? 'تذكرة الحجز' : 'Booking ticket';
            $text .= "$heading\n$title\n".$ticket['reference']."\n";
            $html .= '<section lang="'.$lang.'" dir="'.($ar ? 'rtl' : 'ltr').'" style="margin:0 auto 24px;max-width:600px;background:#fffaf0;border:1px solid #d7cebb;border-radius:16px;overflow:hidden">'
                .'<header style="padding:24px;background:#304936;color:#fffaf0"><h1 style="margin:0">'.$heading.'</h1><p>'.$title.'</p><strong dir="ltr">'.$escape($ticket['reference']).'</strong></header>';
            foreach ($ticket['tickets'] as $item) {
                $p = $item['passenger']; $f = $item['flight'];
                $name = trim($p['firstName'].' '.$p['lastName']);
                $seatLabel = $ar ? 'المقعد' : 'Seat'; $mealLabel = $ar ? 'الوجبة' : 'Meal';
                $meal = $p['meal']['label'][$lang] ?? ($ar ? 'بدون وجبة' : 'No meal');
                $route = $f['originCode'].' → '.$f['destinationCode'];
                $line = $f['flightNumber'].' · '.$f['date'].' · '.$f['departTime'].' – '.(($f['arrivalDate'] ?? $f['date']) !== $f['date'] ? $f['arrivalDate'].' · ' : '').$f['arriveTime'];
                if (isset($f['originTimezone'], $f['destinationTimezone'])) $line .= ' · '.$f['originTimezone'].' → '.$f['destinationTimezone'];
                $html .= '<article style="padding:24px;border-bottom:1px solid #d7cebb"><h2>'.$escape($name).'</h2><p dir="ltr">'.$escape($route).'</p><p dir="ltr">'.$escape($line).'</p>'
                    .'<p>'.$seatLabel.': <b dir="ltr">'.$escape($p['seatCode']).'</b></p><p>'.$mealLabel.': '.$escape($meal).'</p><small dir="ltr">'.$escape($item['ticketNumber']).'</small></article>';
                $text .= "$name\n$route\n$line\n$seatLabel: ".$p['seatCode']."\n$mealLabel: $meal\n".$item['ticketNumber']."\n\n";
            }
            $html .= '</section>';
        }
        return $email->subject('Gaza Gateway · '.$ticket['reference'])->text($text)
            ->html('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:16px;background:#eee7d8;color:#25352b;font-family:Arial,sans-serif">'.$html.'</body></html>');
    }
}
